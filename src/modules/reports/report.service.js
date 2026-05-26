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
  const examIds = (await Exam.find(examFilter).select("_id")).map((exam) => exam._id);
  const attemptFilter = examIds.length || user.role === ROLES.EXAMINER ? { exam: { $in: examIds } } : {};
  const [users, exams, attempts, violations] = await Promise.all([User.countDocuments({ status: "ACTIVE" }), Exam.countDocuments(examFilter), ExamAttempt.countDocuments(attemptFilter), AntiCheatLog.countDocuments(attemptFilter.exam ? { exam: attemptFilter.exam } : {})]);
  return { activeUsers: users, exams, attempts, antiCheatEvents: violations };
};
export const results = async (user, examId, query) => {
  await assertExamReport(user, examId);
  const { page, limit, skip, sort } = paginationParams(query);
  const [attempts, total] = await Promise.all([ExamAttempt.find({ exam: examId, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } }).populate("candidate", "fullName email").sort(sort).skip(skip).limit(limit), ExamAttempt.countDocuments({ exam: examId, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } })]);
  const data = attempts.map((attempt) => ({ candidate: attempt.candidate?.fullName, email: attempt.candidate?.email, score: attempt.score, totalMarks: attempt.totalMarks, percentage: attempt.percentage, passed: attempt.passed, status: attempt.status, submittedAt: attempt.submittedAt }));
  return query.format === "csv" ? { csv: csv(data) } : { data, meta: paginationMeta(page, limit, total) };
};
export const antiCheatCsv = async (user, examId) => {
  await assertExamReport(user, examId);
  const logs = await AntiCheatLog.find({ exam: examId }).populate("candidate", "fullName email");
  return csv(logs.map((log) => ({ candidate: log.candidate?.fullName, email: log.candidate?.email, eventType: log.eventType, severity: log.severity, points: log.points, action: log.systemAction, occurredAt: log.createdAt })));
};
