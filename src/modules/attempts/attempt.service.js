import { ExamAttempt } from "./attempt.model.js";
import { Exam } from "../exams/exam.model.js";
import { Question } from "../question-bank/question.model.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ApiError } from "../../utils/ApiError.js";
import { scheduleExpiry } from "../../config/queue.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { sendExamSubmittedEmail } from "../../emails/email.service.js";
import { emitExamEvent } from "../../sockets/emitter.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { hashToken, verifyAttemptToken } from "../../utils/generateToken.js";

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};
const isAssignedExamOpen = (exam, now = new Date()) => {
  if (!["PUBLISHED", "ACTIVE", "SCHEDULED"].includes(exam.status)) return false;
  if (exam.startTime && now < exam.startTime) return false;
  if (exam.endTime && now > exam.endTime) return false;
  return true;
};
const tokenFromRequest = (req) => req.get("x-attempt-token");
const ownedAttempt = async (req, id) => {
  if (req.user?.role === ROLES.CANDIDATE) {
    const attempt = await ExamAttempt.findOne({ _id: id, $or: [{ candidate: req.user._id }, { candidateUser: req.user._id }] });
    if (!attempt) throw new ApiError(404, "Attempt not found.");
    return attempt;
  }
  const attemptToken = tokenFromRequest(req);
  if (attemptToken) {
    const payload = verifyAttemptToken(attemptToken);
    if (payload.sub !== id) throw new ApiError(403, "Attempt token does not match this attempt.");
    const attempt = await ExamAttempt.findById(id).select("+attemptTokenHash");
    if (!attempt || attempt.attemptTokenHash !== hashToken(attemptToken)) throw new ApiError(403, "Invalid attempt token.");
    return attempt;
  }
  const attempt = await ExamAttempt.findOne({ _id: id, candidate: req.user?._id });
  if (!attempt) throw new ApiError(404, "Attempt not found.");
  return attempt;
};
const presentExam = async (attempt) => {
  const questions = await Question.find({ _id: { $in: attempt.presentation.map((item) => item.question) } });
  const map = new Map(questions.map((question) => [String(question._id), question]));
  return attempt.presentation.map((state) => {
    const question = map.get(String(state.question));
    const options = state.optionOrder.map((key) => question.options.find((option) => option.key === key));
    return { id: question.id, questionText: question.questionText, questionType: question.questionType, options, marks: question.marks };
  });
};
const checkExpiry = async (req, attempt) => {
  if (attempt.status === "IN_PROGRESS" && attempt.expiresAt <= new Date()) {
    await finalizeAttempt(req, attempt.id, "TIMER_EXPIRED", "Exam timer expired.");
    throw new ApiError(409, "The examination time has expired and the attempt was submitted.");
  }
};
export const candidateExams = async (user, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = { assignedCandidates: user._id, status: { $in: ["PUBLISHED", "ACTIVE", "SCHEDULED"] } };
  const [data, total] = await Promise.all([
    Exam.find(filter).select("title code description instructions durationMinutes startTime endTime status antiCheatSettings").sort(sort).skip(skip).limit(limit),
    Exam.countDocuments(filter),
  ]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const list = async (user, query) => {
  const { page, limit, skip, sort } = paginationParams(query);
  const filter = {};
  if (user.role === ROLES.SUB_ADMIN && !user.permissions.includes(PERMISSIONS.VIEW_REPORTS)) throw new ApiError(403, "Required report permission is missing.");
  if (user.role === ROLES.EXAMINER) {
    const examIds = (await Exam.find({ createdBy: user._id }).select("_id")).map((exam) => exam._id);
    filter.exam = { $in: examIds };
    filter.owner = user._id;
    if (query.exam && !examIds.some((examId) => String(examId) === query.exam)) throw new ApiError(403, "You cannot view attempts for this exam.");
  }
  if (query.exam) filter.exam = query.exam;
  if (query.candidate) filter.$or = [{ candidate: query.candidate }, { candidateUser: query.candidate }, { candidateProfile: query.candidate }];
  if (query.status) filter.status = query.status;
  const [data, total] = await Promise.all([
    ExamAttempt.find(filter).populate("exam", "title code status publicUrl").populate("candidate", "fullName email").populate("candidateProfile", "fullName email phone identifier").sort(sort).skip(skip).limit(limit),
    ExamAttempt.countDocuments(filter),
  ]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const instructions = async (candidate, examId) => {
  const exam = await Exam.findOne({ _id: examId, assignedCandidates: candidate._id, status: { $in: ["PUBLISHED", "SCHEDULED", "ACTIVE"] } }).select("title code instructions durationMinutes startTime endTime antiCheatSettings");
  if (!exam) throw new ApiError(404, "Assigned exam not found.");
  if (!isAssignedExamOpen(exam) && exam.startTime && new Date() < exam.startTime) {
    return exam;
  }
  return exam;
};
export const start = async (req, examId, input) => {
  const now = new Date();
  const exam = await Exam.findOne({ _id: examId, assignedCandidates: req.user._id, status: { $in: ["PUBLISHED", "SCHEDULED", "ACTIVE"] } }).populate("questions");
  if (!exam || !isAssignedExamOpen(exam, now)) throw new ApiError(403, "Exam is not currently available.");
  if (await ExamAttempt.exists({ exam: exam._id, candidate: req.user._id, status: "IN_PROGRESS" })) throw new ApiError(409, "An active attempt already exists.");
  const attempts = await ExamAttempt.countDocuments({ exam: exam._id, candidate: req.user._id, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } });
  if (attempts >= exam.maxAttempts) throw new ApiError(409, "Maximum attempts reached.");
  const ordered = exam.randomizeQuestions ? shuffle(exam.questions) : exam.questions;
  const presentation = ordered.map((question) => ({ question: question._id, optionOrder: (exam.randomizeOptions ? shuffle(question.options) : question.options).map((option) => option.key) }));
  const expiry = new Date(Math.min(now.getTime() + exam.durationMinutes * 60000, exam.endTime ? exam.endTime.getTime() : Number.MAX_SAFE_INTEGER));
  const attempt = await ExamAttempt.create({ exam: exam._id, candidate: req.user._id, candidateUser: req.user._id, owner: exam.owner || exam.createdBy, startedAt: now, expiresAt: expiry, presentation, deviceInfo: input.deviceInfo, browserFingerprint: input.browserFingerprint, ipAddress: req.ip, lastHeartbeatAt: now });
  await scheduleExpiry(attempt.id, expiry);
  await recordAudit(req, "ATTEMPT_STARTED", "ExamAttempt", attempt._id, "Candidate started attempt");
  emitExamEvent(exam.id, "exam:candidate-started", { attemptId: attempt.id, candidateId: req.user.id });
  return { attempt, questions: await presentExam(attempt), exam: { id: exam.id, title: exam.title, expiresAt: expiry, antiCheatSettings: exam.antiCheatSettings } };
};
export const get = async (req, id) => {
  let attempt;
  if (!req.user || req.user.role === ROLES.CANDIDATE) {
    attempt = await ownedAttempt(req, id);
  } else {
    attempt = await ExamAttempt.findById(id);
    if (attempt && req.user.role === ROLES.EXAMINER && !await Exam.exists({ _id: attempt.exam, createdBy: req.user._id })) throw new ApiError(403, "You cannot view this attempt.");
    if (attempt && req.user.role === ROLES.SUB_ADMIN && !req.user.permissions.includes(PERMISSIONS.VIEW_REPORTS)) throw new ApiError(403, "Required report permission is missing.");
  }
  if (!attempt) throw new ApiError(404, "Attempt not found.");
  await checkExpiry(req, attempt);
  const result = { attempt };
  if ((!req.user || req.user.role === ROLES.CANDIDATE) && attempt.status === "IN_PROGRESS") {
    result.questions = await presentExam(attempt);
    const exam = await Exam.findById(attempt.exam).select("title antiCheatSettings");
    result.exam = { id: exam.id, title: exam.title, expiresAt: attempt.expiresAt, antiCheatSettings: exam.antiCheatSettings };
  }
  return result;
};
export const saveAnswer = async (req, id, input) => {
  const attempt = await ownedAttempt(req, id);
  if (attempt.status !== "IN_PROGRESS") throw new ApiError(409, "Attempt is no longer in progress.");
  await checkExpiry(req, attempt);
  if (!attempt.presentation.some((item) => String(item.question) === input.questionId)) throw new ApiError(400, "Question does not belong to this attempt.");
  const existing = attempt.answers.find((item) => String(item.question) === input.questionId);
  if (existing) { existing.answer = input.answer; existing.savedAt = new Date(); } else attempt.answers.push({ question: input.questionId, answer: input.answer, savedAt: new Date() });
  if (input.currentQuestionIndex !== undefined) attempt.currentQuestionIndex = input.currentQuestionIndex;
  await attempt.save();
  return attempt;
};
export const heartbeat = async (req, id, input) => {
  const attempt = await ownedAttempt(req, id);
  if (attempt.status !== "IN_PROGRESS") throw new ApiError(409, "Attempt is no longer in progress.");
  await checkExpiry(req, attempt);
  attempt.lastHeartbeatAt = new Date();
  if (input.currentQuestionIndex !== undefined) attempt.currentQuestionIndex = input.currentQuestionIndex;
  await attempt.save();
  return attempt;
};
export const finalizeAttempt = async (req, id, submissionType, reason, suppliedAnswers) => {
  const attempt = await ExamAttempt.findById(id);
  if (!attempt || attempt.status !== "IN_PROGRESS") return attempt;
  const exam = await Exam.findById(attempt.exam);
  const answers = suppliedAnswers || attempt.answers;
  const questions = await Question.find({ _id: { $in: exam.questions } }).select("+correctAnswer");
  const byQuestion = new Map(answers.map((answer) => [String(answer.question || answer.questionId), answer.answer]));
  const score = questions.reduce((total, question) => {
    const supplied = [...(byQuestion.get(String(question._id)) || [])].sort().join("|");
    const correct = [...question.correctAnswer].sort().join("|");
    return total + (supplied === correct ? question.marks : 0);
  }, 0);
  const percentage = exam.totalMarks ? Number(((score / exam.totalMarks) * 100).toFixed(2)) : 0;
  const status = submissionType === "MANUAL" ? "SUBMITTED" : "AUTO_SUBMITTED";
  const updated = await ExamAttempt.findOneAndUpdate({ _id: id, status: "IN_PROGRESS" }, {
    answers: answers.map((answer) => ({ question: answer.question || answer.questionId, answer: answer.answer, savedAt: new Date() })),
    status, submissionType, submittedAt: new Date(), score, totalMarks: exam.totalMarks, percentage,
    passed: score >= exam.passMark, autoSubmitReason: reason
  }, { new: true });
  if (!updated) return ExamAttempt.findById(id);
  if (req?.user) await recordAudit(req, status === "SUBMITTED" ? "ATTEMPT_SUBMITTED" : "ATTEMPT_AUTO_SUBMITTED", "ExamAttempt", updated._id, reason || "Attempt submitted");
  const candidate = req?.user?.role === ROLES.CANDIDATE ? req.user : null;
  if (candidate && status === "SUBMITTED") await sendExamSubmittedEmail(candidate, exam, updated);
  emitExamEvent(exam.id, status === "SUBMITTED" ? "exam:candidate-submitted" : "exam:candidate-auto-submitted", { attemptId: updated.id, candidateId: String(updated.candidate || updated.candidateProfile), reason });
  return updated;
};
export const submit = async (req, id, input) => {
  const attempt = await ownedAttempt(req, id);
  if (attempt.status !== "IN_PROGRESS") throw new ApiError(409, "Attempt has already been submitted.");
  return finalizeAttempt(req, id, "MANUAL", "Candidate submitted the exam.", input.answers);
};
export const result = async (req, id) => {
  const attempt = await ownedAttempt(req, id);
  const exam = await Exam.findById(attempt.exam);
  if (!exam.showResultImmediately) return { pending: true, message: "Result is pending examiner review." };
  return { score: attempt.score, totalMarks: attempt.totalMarks, percentage: attempt.percentage, passed: attempt.passed, status: attempt.status };
};
