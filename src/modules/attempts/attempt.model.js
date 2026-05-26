import mongoose from "mongoose";
import { ATTEMPT_STATUSES, SUBMISSION_TYPES } from "../../constants/statuses.js";

const answerSchema = new mongoose.Schema({ question: { type: mongoose.Schema.Types.ObjectId, ref: "Question" }, answer: [String], savedAt: Date }, { _id: false });
const presentationSchema = new mongoose.Schema({ question: mongoose.Schema.Types.ObjectId, optionOrder: [String] }, { _id: false });
const schema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  candidateUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  candidateProfile: { type: mongoose.Schema.Types.ObjectId, ref: "CandidateProfile", index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  startedAt: Date, submittedAt: Date, expiresAt: Date,
  status: { type: String, enum: ATTEMPT_STATUSES, default: "IN_PROGRESS", index: true },
  answers: [answerSchema], presentation: [presentationSchema],
  score: { type: Number, default: 0 }, totalMarks: { type: Number, default: 0 }, percentage: { type: Number, default: 0 }, passed: Boolean,
  violationScore: { type: Number, default: 0 }, warningCount: { type: Number, default: 0 },
  autoSubmitReason: String, deviceInfo: mongoose.Schema.Types.Mixed, ipAddress: String, browserFingerprint: String,
  attemptTokenHash: { type: String, select: false },
  publicAccessVerifiedAt: Date,
  lastHeartbeatAt: Date, currentQuestionIndex: { type: Number, default: 0 },
  submissionType: { type: String, enum: SUBMISSION_TYPES }
}, { timestamps: true });

schema.index({ exam: 1, candidate: 1, status: 1 });
export const ExamAttempt = mongoose.model("ExamAttempt", schema);
