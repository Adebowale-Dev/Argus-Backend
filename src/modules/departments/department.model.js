import mongoose from "mongoose";
import { RESOURCE_STATUSES } from "../../constants/statuses.js";

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true, unique: true, trim: true },
  description: String,
  status: { type: String, enum: RESOURCE_STATUSES, default: "ACTIVE", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export const Department = mongoose.model("Department", schema);
