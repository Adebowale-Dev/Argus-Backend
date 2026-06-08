import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const jwtOptions = { algorithm: "HS256", issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };
const assertType = (payload, type) => {
  if (payload.type !== type) throw new Error(`Invalid ${type} token type.`);
  return payload;
};

export const generateAccessToken = (user) => jwt.sign(
  { sub: String(user.id), role: user.role, type: "access" },
  env.JWT_ACCESS_SECRET,
  { ...jwtOptions, expiresIn: env.JWT_ACCESS_EXPIRES_IN, jwtid: crypto.randomUUID() }
);
export const generateRefreshToken = (user) => jwt.sign(
  { sub: String(user.id), type: "refresh" },
  env.JWT_REFRESH_SECRET,
  { ...jwtOptions, expiresIn: env.JWT_REFRESH_EXPIRES_IN, jwtid: crypto.randomUUID() }
);
export const verifyAccessToken = (token) => assertType(jwt.verify(token, env.JWT_ACCESS_SECRET, jwtOptions), "access");
export const verifyRefreshToken = (token) => assertType(jwt.verify(token, env.JWT_REFRESH_SECRET, jwtOptions), "refresh");
export const generateExamAccessToken = (exam) => jwt.sign(
  { sub: String(exam.id || exam._id), slug: exam.publicSlug, type: "exam_access" },
  env.JWT_EXAM_ACCESS_SECRET,
  { ...jwtOptions, expiresIn: env.JWT_EXAM_ACCESS_EXPIRES_IN, jwtid: crypto.randomUUID() }
);
export const verifyExamAccessToken = (token) => assertType(jwt.verify(token, env.JWT_EXAM_ACCESS_SECRET, jwtOptions), "exam_access");
export const generateAttemptToken = (attempt) => jwt.sign(
  { sub: String(attempt.id || attempt._id), exam: String(attempt.exam), type: "attempt" },
  env.JWT_ATTEMPT_SECRET,
  { ...jwtOptions, expiresIn: env.JWT_ATTEMPT_EXPIRES_IN, jwtid: crypto.randomUUID() }
);
export const verifyAttemptToken = (token) => assertType(jwt.verify(token, env.JWT_ATTEMPT_SECRET, jwtOptions), "attempt");
export const generateEmailVerificationToken = ({ examId, inviteId, email }) => jwt.sign(
  { sub: String(inviteId), exam: String(examId), email: String(email).toLowerCase(), type: "email_verification" },
  env.JWT_EXAM_ACCESS_SECRET,
  { ...jwtOptions, expiresIn: "30m", jwtid: crypto.randomUUID() }
);
export const verifyEmailVerificationToken = (token) => assertType(jwt.verify(token, env.JWT_EXAM_ACCESS_SECRET, jwtOptions), "email_verification");
export const tokenRemainingMs = (token) => {
  const payload = jwt.decode(token);
  return payload?.exp ? Math.max(payload.exp * 1000 - Date.now(), 0) : undefined;
};
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
export const randomToken = () => crypto.randomBytes(32).toString("hex");
