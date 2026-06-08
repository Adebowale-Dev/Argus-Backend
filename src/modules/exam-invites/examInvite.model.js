import mongoose from "mongoose";

const inviteMetadataSchema = new mongoose.Schema({}, { _id: false, strict: false });

const schema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  fullName: { type: String, trim: true, default: "" },
  identifier: { type: String, trim: true, default: "" },
  metadata: { type: inviteMetadataSchema, default: {} },
  status: { type: String, enum: ["APPROVED", "VERIFIED", "STARTED", "COMPLETED", "REVOKED"], default: "APPROVED", index: true },
  otpHash: { type: String, select: false },
  otpExpiresAt: Date,
  otpAttemptCount: { type: Number, default: 0 },
  otpRequestedAt: Date,
  verifiedAt: Date,
  startedAt: Date,
  lastUsedAt: Date,
  consumedAt: Date,
}, { timestamps: true });

schema.index({ exam: 1, email: 1 }, { unique: true });

schema.set("toJSON", {
  transform: (_doc, value) => {
    value.id = value._id;
    delete value._id;
    delete value.__v;
    delete value.otpHash;
    return value;
  }
});

export const ExamInvite = mongoose.model("ExamInvite", schema);
