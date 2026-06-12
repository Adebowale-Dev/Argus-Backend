import { User } from "../users/user.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { generateAccessToken, generateRefreshToken, hashToken, randomToken, verifyRefreshToken } from "../../utils/generateToken.js";
import { sendPasswordResetEmail } from "../../emails/email.service.js";
import { sendWelcomeEmail } from "../../emails/email.service.js";
import { env } from "../../config/env.js";
import { recordAudit } from "../audit-logs/auditLog.service.js";
import { ROLES } from "../../constants/roles.js";

const publicUser = (user) => ({ id: user.id, fullName: user.fullName, email: user.email, role: user.role, permissions: user.permissions, mustChangePassword: user.mustChangePassword });
const createSession = async (user) => {
  const refreshToken = generateRefreshToken(user);
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });
  return { accessToken: generateAccessToken(user), refreshToken };
};

export const login = async (req, credentials) => {
  const identifier = (credentials.identifier || credentials.email || "").trim().toLowerCase();
  const user = await User.findOne({
    $or: [
      { email: identifier },
      { username: identifier },
    ],
  }).select("+password +refreshTokenHash");
  if (!user || !(await user.comparePassword(credentials.password))) {
    await recordAudit(req, "LOGIN_FAILURE", "User", user?._id, "Failed login attempt", { identifier: credentials.identifier || credentials.email });
    throw new ApiError(401, "Invalid email, username, or password.");
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
  await user.save();
};

export const registerExaminer = async (req, payload) => {
  if (!env.ALLOW_EXAMINER_SELF_REGISTRATION) throw new ApiError(403, "Examiner self-registration is currently disabled.");
  const email = payload.email.toLowerCase();
  if (await User.exists({ email })) throw new ApiError(409, "An account with this email already exists.");
  if (payload.username && await User.exists({ username: payload.username.toLowerCase() })) throw new ApiError(409, "This username is already taken.");
  const user = await User.create({
    fullName: payload.fullName,
    email,
    username: payload.username?.toLowerCase(),
    password: payload.password,
    role: ROLES.EXAMINER,
    permissions: [],
    mustChangePassword: false,
    isEmailVerified: false,
    status: "ACTIVE",
  });
  await sendWelcomeEmail(user);
  await recordAudit({ ...req, user }, "EXAMINER_REGISTERED", "User", user._id, "Examiner self-registration completed");
  return publicUser(user);
};

