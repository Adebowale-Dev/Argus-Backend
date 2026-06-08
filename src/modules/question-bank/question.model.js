import mongoose from "mongoose";
import { RESOURCE_STATUSES } from "../../constants/statuses.js";

const optionSchema = new mongoose.Schema({ key: { type: String, required: true }, text: { type: String, required: true } }, { _id: false });
const assetSchema = new mongoose.Schema({ publicId: String, url: String, resourceType: String, originalName: String }, { _id: false });
const schema = new mongoose.Schema({
  questionBank: { type: mongoose.Schema.Types.ObjectId, ref: "QuestionBank", index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  questionText: { type: String, required: true },
  questionType: { type: String, enum: ["MULTIPLE_CHOICE", "TRUE_FALSE", "SINGLE_SELECT"], required: true },
  options: { type: [optionSchema], required: true },
  correctAnswer: { type: [String], required: true, select: false },
  marks: { type: Number, min: 0, default: 1 },
  topic: String,
  tags: [{ type: String, trim: true }],
  explanation: String,
  attachments: [assetSchema],
  status: { type: String, enum: RESOURCE_STATUSES, default: "ACTIVE", index: true }
}, { timestamps: true });

export const Question = mongoose.model("Question", schema);
