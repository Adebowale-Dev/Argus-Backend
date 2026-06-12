import { Exam } from "../exams/exam.model.js";
import { ExamAttempt } from "../attempts/attempt.model.js";
import { CandidateProfile } from "../candidates/candidateProfile.model.js";
import { ExamInvite } from "../exam-invites/examInvite.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { compareAccessCode } from "../../utils/hashAccessCode.js";
import { generateAttemptToken, generateEmailVerificationToken, generateExamAccessToken, hashToken, randomToken, verifyEmailVerificationToken } from "../../utils/generateToken.js";
import { scheduleExpiry } from "../../config/queue.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { emitExamEvent } from "../../sockets/emitter.js";
import { sendOtpEmail } from "../../emails/email.service.js";
import { env } from "../../config/env.js";

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
const canAccessVerification = (exam) => {
  const now = new Date();
  if (!["PUBLISHED", "ACTIVE", "SCHEDULED"].includes(exam.status)) return false;
  if (exam.status === "DISABLED" || exam.status === "CLOSED") return false;
  if (exam.endTime && now > exam.endTime) return false;
  return true;
};
const isVerifiedInviteExam = (exam) => ["LOGIN_REQUIRED_WITH_CODE", "INVITE_ONLY"].includes(exam.accessType);
const createOtp = () => randomToken().replace(/\D/g, "").slice(0, 6).padEnd(6, "0");

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
    accessCodeRequired: false,
    loginRequired: false,
    emailVerificationRequired: isVerifiedInviteExam(exam),
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
  if (isVerifiedInviteExam(exam)) throw new ApiError(400, "This exam uses email verification instead of an access code.");
  if (!exam.accessCodeHash || !compareAccessCode(accessCode, exam.accessCodeHash)) throw new ApiError(401, "Invalid exam access code.");
  await recordAudit(req, "PUBLIC_EXAM_CODE_VERIFIED", "Exam", exam._id, "Public exam access code verified");
  return { examAccessToken: generateExamAccessToken(exam), expiresIn: "10m" };
};
export const requestEmailOtp = async (req, slug, email) => {
  const exam = await Exam.findOne({ publicSlug: slug });
  if (!exam || !canAccessVerification(exam)) throw new ApiError(404, "Exam is not available for verification.");
  if (!isVerifiedInviteExam(exam)) throw new ApiError(400, "This exam uses a shared access code instead of email verification.");
  const invite = await ExamInvite.findOne({ exam: exam._id, email: email.toLowerCase(), status: { $ne: "REVOKED" } }).select("+otpHash");
  if (!invite) throw new ApiError(403, "This email is not approved to take the exam.");
  if (invite.status === "COMPLETED") throw new ApiError(409, "This invite has already been used for a completed attempt.");
  const otp = createOtp();
  invite.otpHash = hashToken(otp);
  invite.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  invite.otpAttemptCount = 0;
  invite.otpRequestedAt = new Date();
  await invite.save();
  await sendOtpEmail({ email: invite.email, fullName: invite.fullName || "Candidate" }, otp);
  await recordAudit(req, "EXAM_INVITE_OTP_REQUESTED", "ExamInvite", invite._id, "Verified exam OTP requested", { examId: exam._id, email: invite.email });
  return {
    email: invite.email,
    expiresIn: "10m",
    ...(env.NODE_ENV === "development" && !env.SEND_EMAILS ? { devVerificationCode: otp } : {}),
  };
};
export const verifyEmailOtp = async (req, slug, { email, otp }) => {
  const exam = await Exam.findOne({ publicSlug: slug });
  if (!exam || !canAccessVerification(exam)) throw new ApiError(404, "Exam is not available for verification.");
  if (!isVerifiedInviteExam(exam)) throw new ApiError(400, "This exam does not require email verification.");
  const invite = await ExamInvite.findOne({ exam: exam._id, email: email.toLowerCase(), status: { $ne: "REVOKED" } }).select("+otpHash");
  if (!invite) throw new ApiError(403, "This email is not approved to take the exam.");
  if (!invite.otpHash || !invite.otpExpiresAt || invite.otpExpiresAt <= new Date()) throw new ApiError(409, "Verification code has expired. Request a new one.");
  if (invite.otpAttemptCount >= 5) throw new ApiError(429, "Too many invalid verification attempts. Request a new code.");
  if (invite.otpHash !== hashToken(otp)) {
    invite.otpAttemptCount += 1;
    await invite.save();
    throw new ApiError(401, "Verification code is invalid.");
  }
  invite.status = "VERIFIED";
  invite.verifiedAt = new Date();
  invite.otpHash = undefined;
  invite.otpExpiresAt = undefined;
  invite.otpAttemptCount = 0;
  await invite.save();
  await recordAudit(req, "EXAM_INVITE_VERIFIED", "ExamInvite", invite._id, "Verified exam invite email confirmed", { examId: exam._id, email: invite.email });
  return { emailVerificationToken: generateEmailVerificationToken({ examId: exam._id, inviteId: invite._id, email: invite.email }), email: invite.email, verifiedAt: invite.verifiedAt };
};

const resumePublicAttempt = async (attempt, exam, candidateProfile) => {
  const questionsById = new Map(exam.questions.map((question) => [String(question._id), question]));
  const questions = attempt.presentation.map((state) => {
    const question = questionsById.get(String(state.question));
    return { id: question.id, questionText: question.questionText, questionType: question.questionType, options: state.optionOrder.map((key) => question.options.find((option) => option.key === key)), marks: question.marks };
  });
  const attemptToken = generateAttemptToken(attempt);
  attempt.attemptTokenHash = hashToken(attemptToken);
  attempt.lastHeartbeatAt = new Date();
  await attempt.save();
  return { attempt: { id: attempt.id, startedAt: attempt.startedAt, expiresAt: attempt.expiresAt, status: attempt.status, answers: attempt.answers }, attemptToken, candidateProfile, exam: { id: exam.id, title: exam.title, durationMinutes: exam.durationMinutes, expiresAt: attempt.expiresAt, antiCheatSettings: exam.antiCheatSettings }, questions, resumed: true };
};
export const start = async (req, slug, input) => {
  const verifiedPayload = input.emailVerificationToken ? verifyEmailVerificationToken(input.emailVerificationToken) : null;
  const examId = verifiedPayload?.exam;
  const exam = examId
    ? await Exam.findOne({ _id: examId, publicSlug: slug }).populate("questions")
    : await Exam.findOne({ publicSlug: slug }).populate("questions");
  if (!exam || !isOpen(exam)) throw new ApiError(403, "Exam is not currently available.");
  let invite = null;
  if (isVerifiedInviteExam(exam)) {
    if (!verifiedPayload) throw new ApiError(403, "Email verification is required before starting this exam.");
    invite = await ExamInvite.findOne({ _id: verifiedPayload.sub, exam: exam._id, email: verifiedPayload.email, status: { $in: ["VERIFIED", "STARTED"] } });
    if (!invite) throw new ApiError(403, "This invite is no longer valid for the exam.");
  }
  const requirements = exam.candidateIdentityRequirements?.toObject?.() || exam.candidateIdentityRequirements || {};
  for (const [field, required] of Object.entries(requirements)) {
    if (field === "customFields") continue;
    if (required && !input.candidate?.[field]) throw new ApiError(400, `${field} is required for this exam.`);
  }
  for (const field of requirements.customFields || []) {
    if (field.required && !input.candidate?.metadata?.[field.key]) throw new ApiError(400, `${field.label} is required for this exam.`);
  }
  const candidatePayload = {
    ...input.candidate,
    email: (invite?.email || input.candidate.email || "").toLowerCase() || undefined,
    fullName: input.candidate.fullName || invite?.fullName || undefined,
    identifier: input.candidate.identifier || invite?.identifier || undefined,
    metadata: { ...(invite?.metadata || {}), ...(input.candidate.metadata || {}) },
  };
  const profileFilter = candidatePayload.email
    ? { email: candidatePayload.email, identifier: candidatePayload.identifier }
    : { identifier: candidatePayload.identifier, fullName: candidatePayload.fullName };
  const candidateProfile = await CandidateProfile.findOneAndUpdate(profileFilter, candidatePayload, { new: true, upsert: true, setDefaultsOnInsert: true });
  const activeAttempt = await ExamAttempt.findOne({ exam: exam._id, candidateProfile: candidateProfile._id, status: "IN_PROGRESS" }).select("+attemptTokenHash");
  if (activeAttempt) return resumePublicAttempt(activeAttempt, exam, candidateProfile);
  const completed = await ExamAttempt.countDocuments({ exam: exam._id, candidateProfile: candidateProfile._id, $or: [{ status: "SUBMITTED" }, { status: "AUTO_SUBMITTED", retakeGrantedAt: { $exists: false } }] });
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
  if (invite) {
    invite.fullName = candidatePayload.fullName || invite.fullName;
    invite.identifier = candidatePayload.identifier || invite.identifier;
    invite.metadata = { ...(invite.metadata || {}), ...(candidatePayload.metadata || {}) };
    invite.status = "STARTED";
    invite.startedAt = new Date();
    invite.lastUsedAt = new Date();
    await invite.save();
  }
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

