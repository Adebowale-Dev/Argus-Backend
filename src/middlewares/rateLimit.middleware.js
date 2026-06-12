import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const base = { windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000, standardHeaders: true, legacyHeaders: false };
export const apiLimiter = rateLimit({ ...base, limit: env.RATE_LIMIT_MAX_REQUESTS });
export const loginLimiter = rateLimit({
  ...base,
  limit: env.NODE_ENV === "development" ? Math.max(env.LOGIN_RATE_LIMIT_MAX_REQUESTS, 50) : env.LOGIN_RATE_LIMIT_MAX_REQUESTS,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many unsuccessful login attempts. Please try again later.", errors: [] }
});
export const publicExamLimiter = rateLimit({ ...base, limit: env.PUBLIC_EXAM_RATE_LIMIT_MAX_REQUESTS, message: { success: false, message: "Too many exam access attempts. Please try again later.", errors: [] } });
