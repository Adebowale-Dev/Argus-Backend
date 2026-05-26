import mongoose from "mongoose";
import { ANTI_CHEAT_EVENTS, SEVERITIES, SYSTEM_ACTIONS } from "../../constants/antiCheatEvents.js";

const schema = new mongoose.Schema({
  attempt: { type: mongoose.Schema.Types.ObjectId, ref: "ExamAttempt", required: true, index: true },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  candidateProfile: { type: mongoose.Schema.Types.ObjectId, ref: "CandidateProfile", index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  eventType: { type: String, enum: ANTI_CHEAT_EVENTS, required: true },
  severity: { type: String, enum: SEVERITIES, required: true }, points: { type: Number, default: 0 },
  description: String, questionIndex: Number, timeRemaining: Number, metadata: mongoose.Schema.Types.Mixed,
  deviceInfo: mongoose.Schema.Types.Mixed, ipAddress: String,
  evidence: { publicId: String, resourceType: String },
  systemAction: { type: String, enum: SYSTEM_ACTIONS, default: "LOG_ONLY" }
}, { timestamps: true });

["updateOne", "findOneAndUpdate", "deleteOne", "findOneAndDelete"].forEach((operation) => {
  schema.pre(operation, function immutable() {
    throw new Error("Anti-cheat logs are immutable.");
  });
});
export const AntiCheatLog = mongoose.model("AntiCheatLog", schema);
