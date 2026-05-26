import { AntiCheatLog } from "./antiCheatLog.model.js";
import { ExamAttempt } from "../attempts/attempt.model.js";
import { Exam } from "../exams/exam.model.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";
import { eventPoints, severityForPoints, decideAction } from "./antiCheat.engine.js";
import { finalizeAttempt } from "../attempts/attempt.service.js";
import { emitExamEvent } from "../../sockets/emitter.js";
import { uploadBuffer, privateEvidenceUrl } from "../../config/cloudinary.js";
import { sendAutoSubmitAlertEmail } from "../../emails/email.service.js";
import { hashToken, verifyAttemptToken } from "../../utils/generateToken.js";

const candidateAttempt = async (req, attemptId) => {
  const attemptToken = req.get("x-attempt-token");
  if (attemptToken) {
    try {
      const payload = verifyAttemptToken(attemptToken);
      if (payload.sub !== attemptId) throw new ApiError(403, "Attempt token does not match this attempt.");
      const attempt = await ExamAttempt.findOne({ _id: attemptId, status: "IN_PROGRESS" }).select("+attemptTokenHash");
      if (!attempt || attempt.attemptTokenHash !== hashToken(attemptToken)) throw new ApiError(403, "Invalid attempt token.");
      return attempt;
    } catch (error) {
      if (!req.user) throw error;
    }
  }
  const attempt = await ExamAttempt.findOne({ _id: attemptId, $or: [{ candidate: req.user?._id }, { candidateUser: req.user?._id }], status: "IN_PROGRESS" });
  if (!attempt) throw new ApiError(404, "Active attempt not found.");
  return attempt;
};
const canMonitorExam = async (user, examId) => {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role === ROLES.SUB_ADMIN) return user.permissions.includes(PERMISSIONS.VIEW_REPORTS);
  if (user.role === ROLES.EXAMINER) return Boolean(await Exam.exists({ _id: examId, createdBy: user._id }));
  return false;
};
export const logEvent = async (req, attemptId, input) => {
  const attempt = await candidateAttempt(req, attemptId);
  if (attempt.expiresAt <= new Date()) {
    await finalizeAttempt(req, attempt.id, "TIMER_EXPIRED", "Exam timer expired.");
    throw new ApiError(409, "The examination time has expired and the attempt was submitted.");
  }
  const exam = await Exam.findById(attempt.exam).populate("createdBy", "fullName email");
  const points = eventPoints(input.eventType);
  const occurrenceCount = await AntiCheatLog.countDocuments({ attempt: attempt._id, eventType: input.eventType }) + 1;
  const violationScore = attempt.violationScore + points;
  const decision = decideAction({ eventType: input.eventType, occurrenceCount, violationScore, settings: exam.antiCheatSettings, metadata: input.metadata });
  const warningCount = ["WARNING", "FINAL_WARNING"].includes(decision.action) ? 1 : 0;
  await ExamAttempt.updateOne({ _id: attempt._id, status: "IN_PROGRESS" }, { $inc: { violationScore: points, warningCount } });
  const log = await AntiCheatLog.create({ ...input, attempt: attempt._id, exam: exam._id, candidate: req.user?._id, candidateProfile: attempt.candidateProfile, owner: attempt.owner, points, severity: severityForPoints(points), systemAction: decision.action, ipAddress: req.ip });
  emitExamEvent(exam.id, points >= 5 ? "exam:anti-cheat-critical" : "exam:anti-cheat-warning", { log, attemptId: attempt.id, action: decision.action });
  if (decision.action === "AUTO_SUBMIT") {
    const submitted = await finalizeAttempt(req, attempt.id, "ANTI_CHEAT_AUTO_SUBMIT", decision.reason);
    await AntiCheatLog.create({ attempt: attempt._id, exam: exam._id, candidate: req.user?._id, candidateProfile: attempt.candidateProfile, owner: attempt.owner, eventType: "AUTO_SUBMIT_TRIGGERED", severity: "CRITICAL", points: 0, description: decision.reason, systemAction: "AUTO_SUBMIT", ipAddress: req.ip });
    if (exam.createdBy?.email) await sendAutoSubmitAlertEmail(exam.createdBy, req.user || { fullName: "Public candidate", email: "" }, exam, decision.reason);
    return { action: "AUTO_SUBMIT", attemptStatus: submitted.status, violationScore, reason: decision.reason };
  }
  return { action: decision.action, attemptStatus: "IN_PROGRESS", violationScore, log };
};
export const uploadEvidence = async (req, attemptId, eventType) => {
  if (!req.file) throw new ApiError(400, "An evidence image is required.");
  const attempt = await candidateAttempt(req, attemptId);
  const asset = await uploadBuffer(req.file.buffer, "evidence", true);
  const log = await AntiCheatLog.create({ attempt: attempt._id, exam: attempt.exam, candidate: req.user?._id, candidateProfile: attempt.candidateProfile, owner: attempt.owner, eventType, severity: "LOW", points: 0, description: "Monitoring evidence captured.", systemAction: "LOG_ONLY", ipAddress: req.ip, evidence: { publicId: asset.public_id, resourceType: asset.resource_type } });
  return log;
};
export const attemptLogs = async (req, attemptId, query) => {
  const attempt = await ExamAttempt.findById(attemptId).select("+attemptTokenHash");
  if (!attempt) throw new ApiError(404, "Attempt not found.");
  const attemptToken = req.get("x-attempt-token");
  let tokenPermitted = false;
  if (attemptToken) {
    try {
      tokenPermitted = verifyAttemptToken(attemptToken).sub === attemptId && attempt.attemptTokenHash === hashToken(attemptToken);
    } catch {
      tokenPermitted = false;
    }
  }
  const permitted = tokenPermitted || (req.user?.role === ROLES.CANDIDATE ? String(attempt.candidate || attempt.candidateUser) === String(req.user._id) : await canMonitorExam(req.user, attempt.exam));
  if (!permitted) throw new ApiError(403, "You cannot view these logs.");
  const { page, limit, skip, sort } = paginationParams(query);
  const [data, total] = await Promise.all([AntiCheatLog.find({ attempt: attemptId }).sort(sort).skip(skip).limit(limit), AntiCheatLog.countDocuments({ attempt: attemptId })]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const examReports = async (req, examId, query) => {
  if (!await canMonitorExam(req.user, examId)) throw new ApiError(403, "You cannot view this anti-cheat report.");
  const { page, limit, skip, sort } = paginationParams(query);
  const [data, total] = await Promise.all([AntiCheatLog.find({ exam: examId }).populate("candidate", "fullName email").populate("candidateProfile", "fullName email").sort(sort).skip(skip).limit(limit), AntiCheatLog.countDocuments({ exam: examId })]);
  return { data, meta: paginationMeta(page, limit, total) };
};
export const evidenceUrl = async (req, logId) => {
  const log = await AntiCheatLog.findById(logId);
  if (!log?.evidence?.publicId) throw new ApiError(404, "Evidence not found.");
  if (!await canMonitorExam(req.user, log.exam)) throw new ApiError(403, "You cannot access this evidence.");
  return { url: privateEvidenceUrl(log.evidence.publicId, log.evidence.resourceType), expiresInSeconds: 300 };
};
