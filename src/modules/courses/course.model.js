import mongoose from "mongoose";
import { RESOURCE_STATUSES } from "../../constants/statuses.js";

// Legacy compatibility model kept for existing tests and old records.
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: String,
  department: { type: mongoose.Schema.Types.ObjectId },
  examiners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  candidates: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  status: { type: String, enum: RESOURCE_STATUSES, default: "ACTIVE" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export const Course = mongoose.models.Course || mongoose.model("Course", schema);
