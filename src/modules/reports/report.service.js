import { Exam } from "../exams/exam.model.js";
import { ExamAttempt } from "../attempts/attempt.model.js";
import { AntiCheatLog } from "../anti-cheat/antiCheatLog.model.js";
import { User } from "../users/user.model.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginationMeta, paginationParams } from "../../utils/pagination.js";

const assertExamReport = async (user, examId) => {
  if (user.role === ROLES.SUB_ADMIN && !user.permissions.includes(PERMISSIONS.VIEW_REPORTS)) throw new ApiError(403, "Required report permission is missing.");
  if (user.role === ROLES.EXAMINER && !await Exam.exists({ _id: examId, createdBy: user._id })) throw new ApiError(403, "You cannot view this report.");
};
const csv = (rows) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
  return [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
};
export const dashboard = async (user) => {
  const examFilter = user.role === ROLES.EXAMINER ? { createdBy: user._id } : {};
  const scopedExams = await Exam.find(examFilter).select("_id");
  const examIds = scopedExams.map((exam) => exam._id);
  const attemptFilter = examIds.length || user.role === ROLES.EXAMINER ? { exam: { $in: examIds } } : {};
  const userFilter = { status: "ACTIVE" };
  const [users, exams, attempts, violations] = await Promise.all([User.countDocuments(userFilter), Exam.countDocuments(examFilter), ExamAttempt.countDocuments(attemptFilter), AntiCheatLog.countDocuments(attemptFilter.exam ? { exam: attemptFilter.exam } : {})]);
  return { activeUsers: users, exams, attempts, antiCheatEvents: violations };
};
export const results = async (user, examId, query) => {
  await assertExamReport(user, examId);
  const { page, limit, skip, sort } = paginationParams(query);
  const [attempts, total] = await Promise.all([ExamAttempt.find({ exam: examId, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } }).populate("candidate", "fullName email").populate("candidateProfile", "fullName email").sort(sort).skip(skip).limit(limit), ExamAttempt.countDocuments({ exam: examId, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } })]);
  const data = attempts.map((attempt) => ({
    candidate: attempt.candidateProfile?.fullName || attempt.candidate?.fullName,
    email: attempt.candidateProfile?.email || attempt.candidate?.email,
    accessChannel: attempt.candidate ? "ACCOUNT" : "VERIFIED_OR_PUBLIC",
    score: attempt.score,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    passed: attempt.passed,
    status: attempt.status,
    submittedAt: attempt.submittedAt
  }));
  return query.format === "csv" ? { csv: csv(data) } : { data, meta: paginationMeta(page, limit, total) };
};
export const antiCheatCsv = async (user, examId) => {
  await assertExamReport(user, examId);
  const logs = await AntiCheatLog.find({ exam: examId }).populate("candidate", "fullName email").populate("candidateProfile", "fullName email");
  return csv(logs.map((log) => ({ candidate: log.candidateProfile?.fullName || log.candidate?.fullName, email: log.candidateProfile?.email || log.candidate?.email, eventType: log.eventType, severity: log.severity, points: log.points, action: log.systemAction, occurredAt: log.createdAt })));
};

export const examinerOverview = async (user) => {
  if (user.role !== ROLES.EXAMINER) throw new ApiError(403, "Examiner reporting access required.");
  const exams = await Exam.find({ createdBy: user._id }).select("title code status totalMarks passMark createdAt publishedAt").sort({ createdAt: -1 });
  const examIds = exams.map((exam) => exam._id);
  const [attempts, integrityByExam] = await Promise.all([
    ExamAttempt.find({ exam: { $in: examIds } }).populate("candidate", "fullName email").populate("candidateProfile", "fullName email").sort({ updatedAt: -1 }),
    AntiCheatLog.aggregate([{ $match: { exam: { $in: examIds } } }, { $group: { _id: "$exam", events: { $sum: 1 }, points: { $sum: "$points" }, critical: { $sum: { $cond: [{ $eq: ["$severity", "CRITICAL"] }, 1, 0] } } } }]),
  ]);
  const integrityMap = new Map(integrityByExam.map((item) => [String(item._id), item]));
  const completed = attempts.filter((attempt) => ["SUBMITTED", "AUTO_SUBMITTED"].includes(attempt.status));
  const passed = completed.filter((attempt) => attempt.passed).length;
  const examRows = exams.map((exam) => {
    const scoped = attempts.filter((attempt) => String(attempt.exam) === String(exam._id));
    const finished = scoped.filter((attempt) => ["SUBMITTED", "AUTO_SUBMITTED"].includes(attempt.status));
    const integrity = integrityMap.get(String(exam._id)) || {};
    return { id: exam.id, title: exam.title, code: exam.code, status: exam.status, attempts: scoped.length, completed: finished.length, autoSubmitted: finished.filter((attempt) => attempt.status === "AUTO_SUBMITTED").length, averageScore: finished.length ? Number((finished.reduce((sum, attempt) => sum + (attempt.percentage || 0), 0) / finished.length).toFixed(1)) : 0, passRate: finished.length ? Number(((finished.filter((attempt) => attempt.passed).length / finished.length) * 100).toFixed(1)) : 0, integrityEvents: integrity.events || 0, criticalEvents: integrity.critical || 0, createdAt: exam.createdAt };
  });
  return {
    summary: { totalExams: exams.length, totalAttempts: attempts.length, completedAttempts: completed.length, inProgressAttempts: attempts.filter((attempt) => attempt.status === "IN_PROGRESS").length, autoSubmittedAttempts: completed.filter((attempt) => attempt.status === "AUTO_SUBMITTED").length, overallPassRate: completed.length ? Number(((passed / completed.length) * 100).toFixed(1)) : 0, integrityEvents: integrityByExam.reduce((sum, item) => sum + item.events, 0) },
    exams: examRows,
    recentSubmissions: completed.slice(0, 8).map((attempt) => ({ id: attempt.id, examId: String(attempt.exam), candidate: attempt.candidateProfile?.fullName || attempt.candidate?.fullName || "Candidate", email: attempt.candidateProfile?.email || attempt.candidate?.email || "", status: attempt.status, percentage: attempt.percentage, passed: attempt.passed, violationScore: attempt.violationScore, submittedAt: attempt.submittedAt })),
  };
};
