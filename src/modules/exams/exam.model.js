import mongoose from "mongoose";
import { EXAM_STATUSES } from "../../constants/statuses.js";
import { antiCheatDefaults } from "../../utils/antiCheatDefaults.js";
import { DEFAULT_CANDIDATE_IDENTITY_REQUIREMENTS, EXAM_ACCESS_TYPES, EXAM_AVAILABILITY_MODES } from "../../constants/examAccess.js";

const antiCheatSchema = new mongoose.Schema({
  requireFullscreen: Boolean, detectTabSwitch: Boolean, detectWindowBlur: Boolean, disableRightClick: Boolean,
  disableCopyPaste: Boolean, blockDevToolsShortcuts: Boolean, preventMultipleSessions: Boolean,
  requireWebcam: Boolean, captureSnapshots: Boolean, captureScreenshots: Boolean,
  snapshotIntervalSeconds: Number, screenshotIntervalSeconds: Number, maxTabSwitches: Number,
  maxFullscreenExits: Number, maxWindowBlurEvents: Number, maxRefreshAttempts: Number,
  autoSubmitViolationScore: Number, warningViolationScore: Number, finalWarningViolationScore: Number, maxAwaySeconds: Number
}, { _id: false });
const candidateCustomFieldSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: ["text", "email", "tel", "number"], default: "text" },
  placeholder: { type: String, default: "" },
  required: { type: Boolean, default: false },
}, { _id: false });
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  questionBank: { type: mongoose.Schema.Types.ObjectId, ref: "QuestionBank", index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  description: String, instructions: String,
  durationMinutes: { type: Number, required: true, min: 1 },
  startTime: Date, endTime: Date,
  availabilityMode: { type: String, enum: EXAM_AVAILABILITY_MODES, default: "ALWAYS_OPEN", index: true },
  accessType: { type: String, enum: EXAM_ACCESS_TYPES, default: "PUBLIC_LINK_WITH_CODE", index: true },
  publicSlug: { type: String, unique: true, sparse: true, index: true },
  publicUrl: String,
  accessCodeHash: { type: String, select: false },
  accessCodeLastGeneratedAt: Date,
  accessCodeRegeneratedCount: { type: Number, default: 0 },
  candidateIdentityRequirements: {
    fullName: { type: Boolean, default: DEFAULT_CANDIDATE_IDENTITY_REQUIREMENTS.fullName },
    email: { type: Boolean, default: DEFAULT_CANDIDATE_IDENTITY_REQUIREMENTS.email },
    phone: { type: Boolean, default: DEFAULT_CANDIDATE_IDENTITY_REQUIREMENTS.phone },
    identifier: { type: Boolean, default: DEFAULT_CANDIDATE_IDENTITY_REQUIREMENTS.identifier },
    customFields: { type: [candidateCustomFieldSchema], default: [] },
  },
  settingsSummaryVisibleToCandidate: { type: Boolean, default: true },
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  totalMarks: { type: Number, min: 0, default: 0 }, passMark: { type: Number, min: 0, required: true },
  assignedCandidates: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  randomizeQuestions: { type: Boolean, default: false }, randomizeOptions: { type: Boolean, default: false },
  allowBackwardNavigation: { type: Boolean, default: true }, showResultImmediately: { type: Boolean, default: false },
  maxAttempts: { type: Number, default: 1, min: 1 },
  maxAttemptsPerCandidate: { type: Number, default: 1, min: 1 },
  antiCheatSettings: { type: antiCheatSchema, default: antiCheatDefaults },
  status: { type: String, enum: EXAM_STATUSES, default: "DRAFT", index: true },
  publishedAt: Date,
  closedAt: Date,
  disabledByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  disabledReason: String
}, { timestamps: true });

export const Exam = mongoose.model("Exam", schema);
