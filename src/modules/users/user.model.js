import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { ROLES } from "../../constants/roles.js";
import { PERMISSION_VALUES } from "../../constants/permissions.js";
import { USER_STATUSES } from "../../constants/statuses.js";
import { env } from "../../config/env.js";

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: Object.values(ROLES), required: true, index: true },
  permissions: [{ type: String, enum: PERMISSION_VALUES }],
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  status: { type: String, enum: USER_STATUSES, default: "ACTIVE", index: true },
  isEmailVerified: { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: true },
  lastLoginAt: Date,
  passwordChangedAt: Date,
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  refreshTokenHash: { type: String, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  blockedAt: Date,
  blockReason: String
}, { timestamps: true });

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) this.password = await bcrypt.hash(this.password, env.BCRYPT_SALT_ROUNDS);
});
userSchema.methods.comparePassword = function comparePassword(password) { return bcrypt.compare(password, this.password); };
userSchema.set("toJSON", {
  transform: (_doc, value) => {
    delete value.password;
    delete value.refreshTokenHash;
    delete value.passwordResetToken;
    delete value.passwordResetExpires;
    value.id = value._id;
    delete value._id;
    delete value.__v;
    return value;
  }
});

export const User = mongoose.model("User", userSchema);
