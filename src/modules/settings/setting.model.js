import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  value: mongoose.Schema.Types.Mixed, description: String,
  category: { type: String, enum: ["ANTI_CHEAT", "OPERATIONAL", "SECURITY", "AUTH", "OWNERSHIP", "SEED"], required: true, index: true },
  isPublic: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

export const Setting = mongoose.model("Setting", schema);
