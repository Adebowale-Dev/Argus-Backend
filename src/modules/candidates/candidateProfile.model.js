import mongoose from "mongoose";

const schema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, index: true },
  phone: { type: String, trim: true },
  identifier: { type: String, trim: true, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  linkedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
}, { timestamps: true });

schema.index({ email: 1, identifier: 1 });

export const CandidateProfile = mongoose.model("CandidateProfile", schema);
