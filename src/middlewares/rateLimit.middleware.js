import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const base = { windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000, standardHeaders: true, legacyHeaders: false };
export const apiLimiter = rateLimit({ ...base, limit: env.RATE_LIMIT_MAX_REQUESTS });
export const loginLimiter = rateLimit({ ...base, limit: env.LOGIN_RATE_LIMIT_MAX_REQUESTS, message: { success: false, message: "Too many login attempts. Please try again later.", errors: [] } });
