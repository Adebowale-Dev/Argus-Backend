import { startJobWorker } from "../config/queue.js";
import { ExamAttempt } from "../modules/attempts/attempt.model.js";
import { Exam } from "../modules/exams/exam.model.js";
import { AntiCheatLog } from "../modules/anti-cheat/antiCheatLog.model.js";
import { AuditLog } from "../modules/audit-logs/auditLog.model.js";
import { finalizeAttempt } from "../modules/attempts/attempt.service.js";

export const startExamJobs = () => startJobWorker(async (job) => {
  if (job.name === "expire-attempt") {
    const attempt = await ExamAttempt.findById(job.data.attemptId);
    if (!attempt || attempt.status !== "IN_PROGRESS") return;
    const updated = await finalizeAttempt(null, attempt.id, "TIMER_EXPIRED", "Exam timer expired.");
    await AntiCheatLog.create({ attempt: attempt._id, exam: attempt.exam, candidate: attempt.candidate, eventType: "TIMER_EXPIRED", severity: "LOW", points: 0, description: "Server timer expired.", systemAction: "AUTO_SUBMIT" });
    await AuditLog.create({ action: "ATTEMPT_AUTO_SUBMITTED", resourceType: "ExamAttempt", resourceId: updated._id, description: "Timer-expiry worker submitted attempt." });
  }
  if (job.name === "exam-reminder") {
    const exam = await Exam.findById(job.data.examId);
    if (!exam || !["PUBLISHED", "SCHEDULED", "ACTIVE"].includes(exam.status)) return;
  }
});
