import { Exam } from "./exam.model.js";
import { Question } from "../question-bank/question.model.js";
import { QuestionBank } from "../question-banks/questionBank.model.js";
import { ExamAttempt } from "../attempts/attempt.model.js";
import { Setting } from "../settings/setting.model.js";
import { User } from "../users/user.model.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ApiError } from "../../utils/ApiError.js";
import { antiCheatDefaults } from "../../utils/antiCheatDefaults.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { scheduleReminder } from "../../config/queue.js";
import { env } from "../../config/env.js";
import { ensureExamCode, ensureExamLink, generateExamCode, regenerateExamLink as makeNewExamLink } from "./examAccess.service.js";

const owned = (user) => user.role === ROLES.EXAMINER ? { $or: [{ owner: user._id }, { createdBy: user._id }] } : {};
const assertQuestionBank = async (user, questionBankId) => {
  if (!questionBankId) return;
  if (user.role !== ROLES.EXAMINER) return;
  if (!await QuestionBank.exists({ _id: questionBankId, owner: user._id, status: "ACTIVE" })) throw new ApiError(403, "You can only use your own active question banks.");
};
export const list = async (user, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = user.role === ROLES.CANDIDATE ? { _id: null } : owned(user);
  if (query.status && user.role !== ROLES.CANDIDATE) filter.status = query.status;
  const [data, total] = await Promise.all([Exam.find(filter).populate("questionBank", "title").populate("owner", "fullName email").sort(sort).skip(skip).limit(limit), Exam.countDocuments(filter)]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const create = async (req, input) => {
  if (req.user.role !== ROLES.EXAMINER) throw new ApiError(403, "Examiners create exams. Admins oversee and moderate the platform.");
  await assertQuestionBank(req.user, input.questionBank);
  const questionFilter = { _id: { $in: input.questions }, status: "ACTIVE", questionBank: input.questionBank };
  const questions = await Question.find(questionFilter);
  if (questions.length !== input.questions.length) throw new ApiError(400, "All exam questions must be active questions in the selected question bank.");
  const totalMarks = questions.reduce((total, question) => total + question.marks, 0);
  const savedDefaults = await Setting.find({ category: "ANTI_CHEAT", key: /^antiCheat\./ });
  const globalDefaults = savedDefaults.reduce((values, item) => ({ ...values, [item.key.replace("antiCheat.", "")]: item.value }), antiCheatDefaults());
  const exam = new Exam({ ...input, totalMarks, antiCheatSettings: { ...globalDefaults, ...(input.antiCheatSettings || {}) }, owner: req.user._id, createdBy: req.user._id });
  await ensureExamCode(exam);
  await exam.save();
  await recordAudit(req, "EXAM_CREATED", "Exam", exam._id, "Created exam");
  return exam;
};
export const get = async (user, id) => {
  const exam = await Exam.findOne({ _id: id, ...owned(user) }).populate("questionBank", "title").populate("owner", "fullName email");
  if (!exam) throw new ApiError(404, "Exam not found.");
  return exam;
};
export const update = async (req, id, input) => {
  const exam = await Exam.findOne({ _id: id, ...owned(req.user), status: "DRAFT" });
  if (!exam) throw new ApiError(404, "Editable draft exam not found.");
  if (input.questionBank) await assertQuestionBank(req.user, input.questionBank);
  if (input.questions) {
    const questionFilter = { _id: { $in: input.questions }, status: "ACTIVE", questionBank: input.questionBank || exam.questionBank };
    const questions = await Question.find(questionFilter);
    if (questions.length !== input.questions.length) throw new ApiError(400, "All exam questions must be active questions in the selected question bank.");
    input.totalMarks = questions.reduce((total, question) => total + question.marks, 0);
  }
  Object.assign(exam, input);
  if (input.antiCheatSettings) exam.antiCheatSettings = { ...exam.antiCheatSettings.toObject(), ...input.antiCheatSettings };
  await exam.save();
  await recordAudit(req, "EXAM_UPDATED", "Exam", exam._id, "Updated exam");
  return exam;
};
export const remove = async (req, id) => {
  const exam = await Exam.findOneAndUpdate({ _id: id, ...owned(req.user) }, { status: "ARCHIVED" }, { new: true });
  if (!exam) throw new ApiError(404, "Exam not found.");
  await recordAudit(req, "EXAM_ARCHIVED", "Exam", exam._id, "Archived exam");
  return exam;
};
export const publish = async (req, id) => {
  const exam = await Exam.findOne({ _id: id, ...owned(req.user), status: "DRAFT" });
  if (!exam) throw new ApiError(404, "Draft exam not found.");
  if (!exam.instructions || !exam.questions.length || !exam.passMark) throw new ApiError(400, "Exam title, instructions, questions, pass mark, and anti-cheat settings are required before publishing.");
  await ensureExamCode(exam);
  await ensureExamLink(exam);
  const accessCode = generateExamCode(exam);
  exam.status = "PUBLISHED";
  exam.publishedAt = new Date();
  await exam.save();
  if (exam.startTime) {
    const reminderAt = new Date(exam.startTime.getTime() - env.EXAM_REMINDER_MINUTES_BEFORE * 60000);
    if (reminderAt > new Date()) await scheduleReminder(exam.id, reminderAt);
  }
  await recordAudit(req, "EXAM_PUBLISHED", "Exam", exam._id, "Published exam");
  return { examId: exam.id, title: exam.title, code: exam.code, publicUrl: exam.publicUrl, accessCode, durationMinutes: exam.durationMinutes, status: exam.status };
};
export const close = async (req, id) => {
  const exam = await Exam.findOneAndUpdate({ _id: id, ...owned(req.user) }, { status: "CLOSED" }, { new: true });
  if (!exam) throw new ApiError(404, "Exam not found.");
  await recordAudit(req, "EXAM_CLOSED", "Exam", exam._id, "Closed exam");
  return exam;
};
export const disable = async (req, id, reason) => {
  const exam = await Exam.findByIdAndUpdate(id, { status: "DISABLED", disabledByAdmin: req.user._id, disabledReason: reason || "Disabled by platform moderation." }, { new: true });
  if (!exam) throw new ApiError(404, "Exam not found.");
  await recordAudit(req, "EXAM_DISABLED_BY_ADMIN", "Exam", exam._id, "Disabled exam", { reason });
  return exam;
};
export const regenerateAccessCode = async (req, id) => {
  const exam = await Exam.findOne({ _id: id, ...owned(req.user) }).select("+accessCodeHash");
  if (!exam) throw new ApiError(404, "Exam not found.");
  const accessCode = generateExamCode(exam);
  await exam.save();
  await recordAudit(req, "EXAM_ACCESS_CODE_REGENERATED", "Exam", exam._id, "Regenerated exam access code");
  return { examId: exam.id, code: exam.code, publicUrl: exam.publicUrl, accessCode, accessCodeLastGeneratedAt: exam.accessCodeLastGeneratedAt };
};
export const regenerateLink = async (req, id) => {
  const exam = await Exam.findOne({ _id: id, ...owned(req.user) });
  if (!exam) throw new ApiError(404, "Exam not found.");
  await makeNewExamLink(exam);
  await exam.save();
  await recordAudit(req, "EXAM_LINK_REGENERATED", "Exam", exam._id, "Regenerated exam public link");
  return { examId: exam.id, publicUrl: exam.publicUrl };
};
export const accessInfo = async (user, id) => {
  const exam = await Exam.findOne({ _id: id, ...owned(user) }).select("title code publicUrl publicSlug accessCodeLastGeneratedAt accessCodeRegeneratedCount accessType status publishedAt");
  if (!exam) throw new ApiError(404, "Exam not found.");
  return exam;
};
export const attempts = async (user, id, query) => {
  const exam = await Exam.findOne({ _id: id, ...owned(user) });
  if (!exam) throw new ApiError(404, "Exam not found.");
  const { page, limit, skip, sort } = paginationParams(query);
  const [data, total] = await Promise.all([
    ExamAttempt.find({ exam: id }).populate("candidateProfile", "fullName email phone identifier").sort(sort).skip(skip).limit(limit),
    ExamAttempt.countDocuments({ exam: id }),
  ]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const assignCandidates = async (req, id, candidateIds) => {
  const exam = await Exam.findById(id);
  if (!exam) throw new ApiError(404, "Exam not found.");
  if (req.user.role === ROLES.EXAMINER && String(exam.createdBy) !== String(req.user._id)) {
    throw new ApiError(403, "You can only assign candidates to your own exam.");
  }
  if (req.user.role === ROLES.SUB_ADMIN && !req.user.permissions.includes(PERMISSIONS.MANAGE_CANDIDATES)) {
    throw new ApiError(403, "Required candidate management permission is missing.");
  }
  const candidates = await User.find({ _id: { $in: candidateIds }, role: ROLES.CANDIDATE, status: "ACTIVE" }).select("_id");
  if (candidates.length !== candidateIds.length) throw new ApiError(400, "Every assigned user must be an active candidate.");
  exam.assignedCandidates = [...new Set([...(exam.assignedCandidates || []).map((candidate) => String(candidate)), ...candidates.map((candidate) => String(candidate._id))])];
  await exam.save();
  await recordAudit(req, "EXAM_CANDIDATES_ASSIGNED", "Exam", exam._id, `Assigned ${candidates.length} candidate(s) to exam`);
  return { examId: exam.id, assignedCount: exam.assignedCandidates.length };
};
export const candidates = async (user, id) => {
  const exam = await Exam.findOne(user.role === ROLES.EXAMINER ? { _id: id, ...owned(user) } : { _id: id }).populate("assignedCandidates", "fullName email username status");
  if (!exam) throw new ApiError(404, "Exam not found.");
  if (user.role === ROLES.SUB_ADMIN && !user.permissions.includes(PERMISSIONS.MANAGE_CANDIDATES) && !user.permissions.includes(PERMISSIONS.VIEW_USERS)) {
    throw new ApiError(403, "Required candidate visibility permission is missing.");
  }
  return exam.assignedCandidates || [];
};
