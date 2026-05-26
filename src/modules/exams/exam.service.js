import { Exam } from "./exam.model.js";
import { Question } from "../question-bank/question.model.js";
import { Course } from "../courses/course.model.js";
import { User } from "../users/user.model.js";
import { Setting } from "../settings/setting.model.js";
import { ROLES } from "../../constants/roles.js";
import { ApiError } from "../../utils/ApiError.js";
import { antiCheatDefaults } from "../../utils/antiCheatDefaults.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { scheduleReminder } from "../../config/queue.js";
import { env } from "../../config/env.js";
import { sendExamAssignedEmail } from "../../emails/email.service.js";

const owned = (user) => user.role === ROLES.EXAMINER ? { createdBy: user._id } : {};
const assertCourse = async (user, courseId) => {
  if (user.role === ROLES.EXAMINER && !await Course.exists({ _id: courseId, examiners: user._id })) throw new ApiError(403, "You are not assigned to this course.");
};
export const list = async (user, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = user.role === ROLES.CANDIDATE ? { assignedCandidates: user._id, status: { $in: ["SCHEDULED", "ACTIVE"] } } : owned(user);
  if (query.status && user.role !== ROLES.CANDIDATE) filter.status = query.status;
  const [data, total] = await Promise.all([Exam.find(filter).populate("course", "title code").sort(sort).skip(skip).limit(limit), Exam.countDocuments(filter)]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const create = async (req, input) => {
  await assertCourse(req.user, input.course);
  const questions = await Question.find({ _id: { $in: input.questions }, course: input.course, status: "ACTIVE" });
  if (questions.length !== input.questions.length) throw new ApiError(400, "All exam questions must be active questions in the selected course.");
  const totalMarks = questions.reduce((total, question) => total + question.marks, 0);
  const savedDefaults = await Setting.find({ category: "ANTI_CHEAT", key: /^antiCheat\./ });
  const globalDefaults = savedDefaults.reduce((values, item) => ({ ...values, [item.key.replace("antiCheat.", "")]: item.value }), antiCheatDefaults());
  const exam = await Exam.create({ ...input, totalMarks, antiCheatSettings: { ...globalDefaults, ...(input.antiCheatSettings || {}) }, createdBy: req.user._id });
  await recordAudit(req, "EXAM_CREATED", "Exam", exam._id, "Created exam");
  return exam;
};
export const get = async (user, id) => {
  const filter = user.role === ROLES.CANDIDATE ? { _id: id, assignedCandidates: user._id, status: { $in: ["SCHEDULED", "ACTIVE"] } } : { _id: id, ...owned(user) };
  const exam = await Exam.findOne(filter).populate("course", "title code");
  if (!exam) throw new ApiError(404, "Exam not found.");
  return exam;
};
export const update = async (req, id, input) => {
  const exam = await Exam.findOne({ _id: id, ...owned(req.user), status: "DRAFT" });
  if (!exam) throw new ApiError(404, "Editable draft exam not found.");
  if (input.course) await assertCourse(req.user, input.course);
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
  exam.status = exam.startTime <= new Date() ? "ACTIVE" : "SCHEDULED";
  exam.publishedAt = new Date();
  await exam.save();
  const reminderAt = new Date(exam.startTime.getTime() - env.EXAM_REMINDER_MINUTES_BEFORE * 60000);
  if (reminderAt > new Date()) await scheduleReminder(exam.id, reminderAt);
  await recordAudit(req, "EXAM_PUBLISHED", "Exam", exam._id, "Published exam");
  return exam;
};
export const close = async (req, id) => {
  const exam = await Exam.findOneAndUpdate({ _id: id, ...owned(req.user) }, { status: "CLOSED" }, { new: true });
  if (!exam) throw new ApiError(404, "Exam not found.");
  await recordAudit(req, "EXAM_CLOSED", "Exam", exam._id, "Closed exam");
  return exam;
};
export const assignCandidates = async (req, id, candidateIds) => {
  const exam = await Exam.findOne({ _id: id, ...owned(req.user) });
  if (!exam) throw new ApiError(404, "Exam not found.");
  const candidates = await User.find({ _id: { $in: candidateIds }, role: ROLES.CANDIDATE, status: "ACTIVE" });
  if (candidates.length !== candidateIds.length) throw new ApiError(400, "Every assignment must reference an active candidate.");
  exam.assignedCandidates = [...new Set([...exam.assignedCandidates.map(String), ...candidateIds])];
  await exam.save();
  await Promise.all(candidates.map((candidate) => sendExamAssignedEmail(candidate, exam)));
  await recordAudit(req, "CANDIDATES_ASSIGNED", "Exam", exam._id, "Assigned candidates", { candidateIds });
  return exam;
};
export const candidates = async (user, id) => {
  const exam = await Exam.findOne({ _id: id, ...owned(user) }).populate("assignedCandidates", "fullName email status");
  if (!exam) throw new ApiError(404, "Exam not found.");
  return exam.assignedCandidates;
};
