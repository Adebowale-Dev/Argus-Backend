import { Exam } from "../exams/exam.model.js";
import { ExamAttempt } from "../attempts/attempt.model.js";
import { CandidateProfile } from "../candidates/candidateProfile.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { compareAccessCode } from "../../utils/hashAccessCode.js";
import { generateAttemptToken, generateExamAccessToken, hashToken, verifyExamAccessToken } from "../../utils/generateToken.js";
import { scheduleExpiry } from "../../config/queue.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { emitExamEvent } from "../../sockets/emitter.js";

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

const isOpen = (exam) => {
  const now = new Date();
  if (!["PUBLISHED", "ACTIVE", "SCHEDULED"].includes(exam.status)) return false;
  if (exam.status === "DISABLED" || exam.status === "CLOSED") return false;
  if (exam.availabilityMode === "ALWAYS_OPEN") return true;
  if (exam.availabilityMode === "SCHEDULED") return (!exam.startTime || now >= exam.startTime) && (!exam.endTime || now <= exam.endTime);
  return false;
};

const antiCheatSummary = (settings = {}) => ({
  requiresFullscreen: Boolean(settings.requireFullscreen),
  detectsTabSwitching: Boolean(settings.detectTabSwitch),
  blocksCopyPaste: Boolean(settings.disableCopyPaste),
  webcamRequired: Boolean(settings.requireWebcam),
  autoSubmitEnabled: Boolean(settings.autoSubmitViolationScore),
});

const presentQuestions = (exam) => {
  const ordered = exam.randomizeQuestions ? shuffle(exam.questions) : exam.questions;
  const presentation = ordered.map((question) => ({
    question: question._id,
    optionOrder: (exam.randomizeOptions ? shuffle(question.options) : question.options).map((option) => option.key),
  }));
  const questions = ordered.map((question, index) => ({
    id: question.id,
    questionText: question.questionText,
    questionType: question.questionType,
    options: presentation[index].optionOrder.map((key) => question.options.find((option) => option.key === key)),
    marks: question.marks,
  }));
  return { presentation, questions };
};

export const landing = async (slug) => {
  const exam = await Exam.findOne({ publicSlug: slug }).populate("owner", "fullName").populate("questions", "_id");
  if (!exam) throw new ApiError(404, "Exam not found.");
  return {
    id: exam.id,
    code: exam.code,
    title: exam.title,
    description: exam.description,
    instructions: exam.instructions,
    durationMinutes: exam.durationMinutes,
    questionCount: exam.questions.length,
    totalMarks: exam.totalMarks,
    passMark: exam.passMark,
    accessType: exam.accessType,
    examinerName: exam.owner?.fullName,
    antiCheatSummary: antiCheatSummary(exam.antiCheatSettings),
    candidateIdentityRequirements: exam.candidateIdentityRequirements,
    accessCodeRequired: ["PUBLIC_LINK_WITH_CODE", "LOGIN_REQUIRED_WITH_CODE"].includes(exam.accessType),
    loginRequired: exam.accessType === "LOGIN_REQUIRED_WITH_CODE",
    canStart: isOpen(exam),
    status: exam.status,
  };
};

export const resolveExamCode = async (examCode) => {
  const exam = await Exam.findOne({ code: String(examCode).toUpperCase(), status: { $in: ["PUBLISHED", "ACTIVE", "SCHEDULED"] } }).select("code publicSlug title status");
  if (!exam || !exam.publicSlug) throw new ApiError(404, "Exam code not found.");
  return { examCode: exam.code, slug: exam.publicSlug, title: exam.title, status: exam.status };
};

export const verifyCode = async (req, slug, accessCode) => {
  const exam = await Exam.findOne({ publicSlug: slug }).select("+accessCodeHash");
  if (!exam || !isOpen(exam)) throw new ApiError(404, "Exam is not available.");
  if (!exam.accessCodeHash || !compareAccessCode(accessCode, exam.accessCodeHash)) throw new ApiError(401, "Invalid exam access code.");
  await recordAudit(req, "PUBLIC_EXAM_CODE_VERIFIED", "Exam", exam._id, "Public exam access code verified");
  return { examAccessToken: generateExamAccessToken(exam), expiresIn: "10m" };
};

export const start = async (req, slug, input) => {
  const payload = verifyExamAccessToken(input.examAccessToken);
  const exam = await Exam.findOne({ _id: payload.sub, publicSlug: slug }).populate("questions");
  if (!exam || !isOpen(exam)) throw new ApiError(403, "Exam is not currently available.");
  const requirements = exam.candidateIdentityRequirements?.toObject?.() || exam.candidateIdentityRequirements || {};
  for (const [field, required] of Object.entries(requirements)) {
    if (field === "customFields") continue;
    if (required && !input.candidate?.[field]) throw new ApiError(400, `${field} is required for this exam.`);
  }
  for (const field of requirements.customFields || []) {
    if (field.required && !input.candidate?.metadata?.[field.key]) throw new ApiError(400, `${field.label} is required for this exam.`);
  }
  const profileFilter = input.candidate.email
    ? { email: input.candidate.email.toLowerCase(), identifier: input.candidate.identifier }
    : { identifier: input.candidate.identifier, fullName: input.candidate.fullName };
  const candidateProfile = await CandidateProfile.findOneAndUpdate(profileFilter, { ...input.candidate, metadata: input.candidate.metadata || {} }, { new: true, upsert: true, setDefaultsOnInsert: true });
  const duplicateFilter = { exam: exam._id, candidateProfile: candidateProfile._id, status: "IN_PROGRESS" };
  if (input.browserFingerprint) duplicateFilter.browserFingerprint = input.browserFingerprint;
  if (await ExamAttempt.exists(duplicateFilter)) throw new ApiError(409, "An active attempt already exists for this exam.");
  const completed = await ExamAttempt.countDocuments({ exam: exam._id, candidateProfile: candidateProfile._id, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } });
  if (completed >= (exam.maxAttemptsPerCandidate || exam.maxAttempts || 1)) throw new ApiError(409, "Maximum attempts reached.");
  const now = new Date();
  const expiryLimit = exam.endTime ? exam.endTime.getTime() : Number.MAX_SAFE_INTEGER;
  const expiresAt = new Date(Math.min(now.getTime() + exam.durationMinutes * 60000, expiryLimit));
  const { presentation, questions } = presentQuestions(exam);
  const attempt = await ExamAttempt.create({
    exam: exam._id,
    candidateProfile: candidateProfile._id,
    owner: exam.owner || exam.createdBy,
    startedAt: now,
    expiresAt,
    presentation,
    deviceInfo: input.deviceInfo,
    browserFingerprint: input.browserFingerprint,
    ipAddress: req.ip,
    publicAccessVerifiedAt: new Date(),
    lastHeartbeatAt: now,
  });
  const attemptToken = generateAttemptToken(attempt);
  attempt.attemptTokenHash = hashToken(attemptToken);
  await attempt.save();
  await scheduleExpiry(attempt.id, expiresAt);
  await recordAudit(req, "ATTEMPT_STARTED", "ExamAttempt", attempt._id, "Public candidate started attempt");
  emitExamEvent(exam.id, "exam:candidate-started", { attemptId: attempt.id, candidateProfileId: candidateProfile.id });
  return {
    attempt: { id: attempt.id, startedAt: attempt.startedAt, expiresAt: attempt.expiresAt, status: attempt.status },
    attemptToken,
    candidateProfile,
    exam: { id: exam.id, title: exam.title, durationMinutes: exam.durationMinutes, expiresAt, antiCheatSettings: exam.antiCheatSettings },
    questions,
  };
};
