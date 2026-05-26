import mongoose from "mongoose";
import { EXAM_STATUSES } from "../../constants/statuses.js";
import { antiCheatDefaults } from "../../utils/antiCheatDefaults.js";

const antiCheatSchema = new mongoose.Schema({
  requireFullscreen: Boolean, detectTabSwitch: Boolean, detectWindowBlur: Boolean, disableRightClick: Boolean,
  disableCopyPaste: Boolean, blockDevToolsShortcuts: Boolean, preventMultipleSessions: Boolean,
  requireWebcam: Boolean, captureSnapshots: Boolean, captureScreenshots: Boolean,
  snapshotIntervalSeconds: Number, screenshotIntervalSeconds: Number, maxTabSwitches: Number,
  maxFullscreenExits: Number, maxWindowBlurEvents: Number, maxRefreshAttempts: Number,
  autoSubmitViolationScore: Number, warningViolationScore: Number, finalWarningViolationScore: Number, maxAwaySeconds: Number
}, { _id: false });
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  description: String, instructions: String,
  durationMinutes: { type: Number, required: true, min: 1 },
  startTime: { type: Date, required: true }, endTime: { type: Date, required: true },
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  totalMarks: { type: Number, min: 0, default: 0 }, passMark: { type: Number, min: 0, required: true },
  assignedCandidates: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  randomizeQuestions: { type: Boolean, default: false }, randomizeOptions: { type: Boolean, default: false },
  allowBackwardNavigation: { type: Boolean, default: true }, showResultImmediately: { type: Boolean, default: false },
  maxAttempts: { type: Number, default: 1, min: 1 },
  antiCheatSettings: { type: antiCheatSchema, default: antiCheatDefaults },
  status: { type: String, enum: EXAM_STATUSES, default: "DRAFT", index: true },
  publishedAt: Date
}, { timestamps: true });

export const Exam = mongoose.model("Exam", schema);
