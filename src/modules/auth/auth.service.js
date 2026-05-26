import { User } from "../users/user.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { generateAccessToken, generateRefreshToken, hashToken, randomToken, verifyRefreshToken } from "../../utils/generateToken.js";
import { sendPasswordResetEmail } from "../../emails/email.service.js";
import { env } from "../../config/env.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";

const publicUser = (user) => ({ id: user.id, fullName: user.fullName, email: user.email, role: user.role, permissions: user.permissions, mustChangePassword: user.mustChangePassword });
const createSession = async (user) => {
  const refreshToken = generateRefreshToken(user);
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });
  return { accessToken: generateAccessToken(user), refreshToken };
};

export const login = async (req, credentials) => {
  const user = await User.findOne({ email: credentials.email.toLowerCase() }).select("+password +refreshTokenHash");
  if (!user || !(await user.comparePassword(credentials.password))) {
    await recordAudit(req, "LOGIN_FAILURE", "User", user?._id, "Failed login attempt", { email: credentials.email });
    throw new ApiError(401, "Invalid email or password.");
  }
  if (user.status !== "ACTIVE") throw new ApiError(403, "This account cannot sign in.");
  user.lastLoginAt = new Date();
  const tokens = await createSession(user);
  await recordAudit({ ...req, user }, "LOGIN_SUCCESS", "User", user._id, "User signed in");
  return { user: publicUser(user), ...tokens };
};

export const refresh = async (token) => {
  if (!token) throw new ApiError(401, "Refresh token is required.");
  let payload;
  try { payload = verifyRefreshToken(token); } catch { throw new ApiError(401, "Refresh token is invalid or expired."); }
  const user = await User.findById(payload.sub).select("+refreshTokenHash");
  if (!user || user.status !== "ACTIVE" || user.refreshTokenHash !== hashToken(token)) throw new ApiError(401, "Refresh token is no longer valid.");
  const tokens = await createSession(user);
  return { user: publicUser(user), ...tokens };
};

export const logout = async (userId) => {
  if (userId) await User.findByIdAndUpdate(userId, { $unset: { refreshTokenHash: 1 } });
};

export const forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase(), status: "ACTIVE" }).select("+passwordResetToken +passwordResetExpires");
  if (!user) return;
  const token = randomToken();
  user.passwordResetToken = hashToken(token);
  user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  await sendPasswordResetEmail(user, `${env.CLIENT_URL}/reset-password?token=${token}`);
};

export const resetPassword = async ({ token, password }) => {
  const user = await User.findOne({ passwordResetToken: hashToken(token), passwordResetExpires: { $gt: new Date() } }).select("+password +passwordResetToken +passwordResetExpires");
  if (!user) throw new ApiError(400, "Password reset token is invalid or expired.");
  user.password = password;
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokenHash = undefined;
  await user.save();
};

export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select("+password");
  if (!user || !(await user.comparePassword(currentPassword))) throw new ApiError(400, "Current password is incorrect.");
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  user.refreshTokenHash = undefined;
  await user.save();
};
