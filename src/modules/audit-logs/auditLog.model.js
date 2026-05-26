import mongoose from "mongoose";

const schema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, actorRole: String, action: { type: String, required: true, index: true },
  resourceType: { type: String, required: true }, resourceId: mongoose.Schema.Types.ObjectId, description: String,
  metadata: mongoose.Schema.Types.Mixed, ipAddress: String, userAgent: String
}, { timestamps: true });

export const AuditLog = mongoose.model("AuditLog", schema);
