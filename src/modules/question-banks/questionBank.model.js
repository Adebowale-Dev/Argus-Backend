import mongoose from "mongoose";
import { RESOURCE_STATUSES } from "../../constants/statuses.js";

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tags: [{ type: String, trim: true }],
  visibility: { type: String, enum: ["PRIVATE", "SHARED", "ARCHIVED"], default: "PRIVATE", index: true },
  status: { type: String, enum: RESOURCE_STATUSES, default: "ACTIVE", index: true },
  questionCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

schema.index({ owner: 1, title: 1 });

export const QuestionBank = mongoose.model("QuestionBank", schema);
