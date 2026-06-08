import { AntiCheatLog } from "../anti-cheat/antiCheatLog.model.js";
import { Exam } from "../exams/exam.model.js";
import { QuestionBank } from "../question-banks/questionBank.model.js";
import { ExamAttempt } from "../attempts/attempt.model.js";
import { User } from "../users/user.model.js";
import { ExamInvite } from "../exam-invites/examInvite.model.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ApiError } from "../../utils/ApiError.js";

const examVisibilityFilter = { status: { $in: ["PUBLISHED", "ACTIVE", "SCHEDULED"] } };

export const adminDashboard = async (user) => {
  if (user.role === ROLES.SUB_ADMIN && !user.permissions.includes(PERMISSIONS.VIEW_DASHBOARD)) {
    throw new ApiError(403, "Required dashboard permission is missing.");
  }
  const [activeUsers, totalExams, totalAttempts, antiCheatEvents, totalInvites, verifiedInvites, flaggedAttempts, recentExams, examStatusCounts] = await Promise.all([
    User.countDocuments({ status: "ACTIVE" }),
    Exam.countDocuments(),
    ExamAttempt.countDocuments(),
    AntiCheatLog.countDocuments(),
    ExamInvite.countDocuments(),
    ExamInvite.countDocuments({ status: { $in: ["VERIFIED", "STARTED", "COMPLETED"] } }),
    ExamAttempt.find({ violationScore: { $gt: 0 } }).populate("exam", "title code").populate("candidateProfile", "fullName email").populate("candidate", "fullName email").sort("-updatedAt").limit(5),
    Exam.find({}).sort("-createdAt").select("title code status createdAt publicUrl").limit(5),
    Exam.aggregate([{ $group: { _id: "$status", total: { $sum: 1 } } }]),
  ]);
  return {
    summary: { activeUsers, totalExams, totalAttempts, antiCheatEvents, totalInvites, verifiedInvites },
    charts: {
      examStatus: examStatusCounts.map((item) => ({ status: item._id, total: item.total })),
      inviteFunnel: [
        { label: "Approved", total: Math.max(totalInvites - verifiedInvites, 0) },
        { label: "Verified", total: verifiedInvites },
      ],
    },
    recentFlaggedAttempts: flaggedAttempts.map((attempt) => ({
      id: attempt.id,
      examTitle: attempt.exam?.title,
      examCode: attempt.exam?.code,
      candidateName: attempt.candidateProfile?.fullName || attempt.candidate?.fullName || "Unknown candidate",
      candidateEmail: attempt.candidateProfile?.email || attempt.candidate?.email || "",
      status: attempt.status,
      violationScore: attempt.violationScore ?? 0,
      updatedAt: attempt.updatedAt,
    })),
    recentExams: recentExams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      code: exam.code,
      status: exam.status,
      publicUrl: exam.publicUrl,
      createdAt: exam.createdAt,
    })),
  };
};

export const examinerDashboard = async (user) => {
  const ownedExamFilter = { createdBy: user._id };
  const ownedExamIds = (await Exam.find(ownedExamFilter).select("_id")).map((exam) => exam._id);
  const [questionBanks, totalExams, publishedExams, activeAttempts, flaggedAttempts, recentExams, inviteCounts, outcomeCounts] = await Promise.all([
    QuestionBank.countDocuments({ owner: user._id }),
    Exam.countDocuments(ownedExamFilter),
    Exam.countDocuments({ ...ownedExamFilter, ...examVisibilityFilter }),
    ExamAttempt.countDocuments({ exam: { $in: ownedExamIds }, status: "IN_PROGRESS" }),
    ExamAttempt.countDocuments({ exam: { $in: ownedExamIds }, violationScore: { $gt: 0 } }),
    Exam.find(ownedExamFilter).sort("-createdAt").select("title code status createdAt publicUrl").limit(5),
    ExamInvite.aggregate([{ $match: { owner: user._id } }, { $group: { _id: "$status", total: { $sum: 1 } } }]),
    ExamAttempt.aggregate([{ $match: { exam: { $in: ownedExamIds }, status: { $in: ["SUBMITTED", "AUTO_SUBMITTED"] } } }, { $group: { _id: "$passed", total: { $sum: 1 } } }]),
  ]);
  return {
    summary: { questionBanks, totalExams, publishedExams, activeAttempts, flaggedAttempts },
    charts: {
      invites: inviteCounts.map((item) => ({ status: item._id, total: item.total })),
      outcomes: outcomeCounts.map((item) => ({ outcome: item._id ? "Passed" : "Failed", total: item.total })),
    },
    recentExams: recentExams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      code: exam.code,
      status: exam.status,
      publicUrl: exam.publicUrl,
      createdAt: exam.createdAt,
    })),
  };
};

export const candidateDashboard = async (user) => {
  const assignedExams = await Exam.find({ assignedCandidates: user._id, ...examVisibilityFilter })
    .sort("startTime createdAt")
    .select("title code status startTime endTime durationMinutes instructions antiCheatSettings");
  const attempts = await ExamAttempt.find({ $or: [{ candidate: user._id }, { candidateUser: user._id }] })
    .populate("exam", "title code status startTime endTime durationMinutes")
    .sort("-updatedAt")
    .limit(10);

  const now = new Date();
  const availableToTake = assignedExams.filter((exam) => {
    const withinStart = !exam.startTime || now >= exam.startTime;
    const beforeEnd = !exam.endTime || now <= exam.endTime;
    return withinStart && beforeEnd;
  });
  const activeAttempt = attempts.find((attempt) => attempt.status === "IN_PROGRESS");
  const completedAttempts = attempts.filter((attempt) => ["SUBMITTED", "AUTO_SUBMITTED"].includes(attempt.status));

  return {
    summary: {
      assignedCount: assignedExams.length,
      availableCount: availableToTake.length,
      inProgressCount: activeAttempt ? 1 : 0,
      completedCount: completedAttempts.length,
    },
    nextExam: availableToTake[0] ? {
      id: availableToTake[0].id,
      title: availableToTake[0].title,
      code: availableToTake[0].code,
      status: availableToTake[0].status,
      startTime: availableToTake[0].startTime,
      endTime: availableToTake[0].endTime,
      durationMinutes: availableToTake[0].durationMinutes,
    } : null,
    assignedExams: assignedExams.slice(0, 6).map((exam) => ({
      id: exam.id,
      title: exam.title,
      code: exam.code,
      status: exam.status,
      startTime: exam.startTime,
      endTime: exam.endTime,
      durationMinutes: exam.durationMinutes,
    })),
    activeAttempt: activeAttempt ? {
      id: activeAttempt.id,
      examTitle: activeAttempt.exam?.title,
      examCode: activeAttempt.exam?.code,
      expiresAt: activeAttempt.expiresAt,
      status: activeAttempt.status,
    } : null,
    completedAttempts: completedAttempts.slice(0, 5).map((attempt) => ({
      id: attempt.id,
      examTitle: attempt.exam?.title,
      examCode: attempt.exam?.code,
      score: attempt.score,
      percentage: attempt.percentage,
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
      status: attempt.status,
    })),
  };
};
