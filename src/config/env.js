import "dotenv/config";
import { z } from "zod";

const booleanValue = z.string().default("false").transform((value) => value === "true");
const numberValue = (fallback) => z.coerce.number().default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("ARGUS"),
  PORT: numberValue(5000),
  API_PREFIX: z.string().default("/api/v1"),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  SERVER_URL: z.string().default("http://localhost:5000"),
  PUBLIC_EXAM_URL: z.string().default("http://localhost:3000/exam"),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_REQUIRE_NOEVICTION: booleanValue,
  ALLOW_EXAMINER_SELF_REGISTRATION: booleanValue.default("false"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ATTEMPT_SECRET: z.string().min(32).default("replace_with_strong_exam_attempt_secret_32_chars"),
  JWT_EXAM_ACCESS_SECRET: z.string().min(32).default("replace_with_exam_access_secret_32_chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  JWT_ATTEMPT_EXPIRES_IN: z.string().default("4h"),
  JWT_EXAM_ACCESS_EXPIRES_IN: z.string().default("10m"),
  JWT_ISSUER: z.string().default("argus-api"),
  JWT_AUDIENCE: z.string().default("argus-client"),
  REFRESH_COOKIE_NAME: z.string().default("argus_refresh_token"),
  COOKIE_SECURE: booleanValue,
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CSRF_ENABLED: booleanValue,
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@gmail.com"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8).default("123456789"),
  BREVO_API_KEY: z.string().default(""),
  BREVO_SENDER_EMAIL: z.string().email().default("no-reply@argus.local"),
  BREVO_SENDER_NAME: z.string().default("ARGUS CBT Platform"),
  SEND_EMAILS: booleanValue,
  EMAIL_TEMPLATE_BRAND_NAME: z.string().default("ARGUS"),
  EMAIL_TEMPLATE_SUPPORT_EMAIL: z.string().email().default("support@argus.local"),
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_FOLDER: z.string().default("argus"),
  EVIDENCE_SIGNED_URL_EXPIRES_SECONDS: numberValue(300),
  BCRYPT_SALT_ROUNDS: numberValue(12),
  ACCESS_CODE_HASH_SECRET: z.string().min(16).default("replace_with_access_code_hash_secret"),
  RATE_LIMIT_WINDOW_MINUTES: numberValue(15),
  RATE_LIMIT_MAX_REQUESTS: numberValue(100),
  LOGIN_RATE_LIMIT_MAX_REQUESTS: numberValue(5),
  PUBLIC_EXAM_RATE_LIMIT_MAX_REQUESTS: numberValue(30),
  MAX_UPLOAD_SIZE_MB: numberValue(5),
  UPLOAD_DIR: z.string().default("uploads"),
  EXAM_ACCESS_CODE_LENGTH: numberValue(6),
  EXAM_SLUG_LENGTH: numberValue(10),
  DEFAULT_MAX_TAB_SWITCHES: numberValue(2),
  DEFAULT_MAX_FULLSCREEN_EXITS: numberValue(2),
  DEFAULT_MAX_WINDOW_BLUR_EVENTS: numberValue(2),
  DEFAULT_MAX_REFRESH_ATTEMPTS: numberValue(2),
  DEFAULT_AUTO_SUBMIT_VIOLATION_SCORE: numberValue(8),
  DEFAULT_WARNING_VIOLATION_SCORE: numberValue(3),
  DEFAULT_FINAL_WARNING_VIOLATION_SCORE: numberValue(5),
  DEFAULT_MAX_AWAY_SECONDS: numberValue(10),
  EXAM_REMINDER_MINUTES_BEFORE: numberValue(30),
  LOG_LEVEL: z.string().default("info")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

export const env = Object.freeze(parsed.data);
export const isProduction = env.NODE_ENV === "production";
