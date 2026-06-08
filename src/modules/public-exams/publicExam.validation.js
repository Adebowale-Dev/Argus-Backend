import { z } from "zod";

const optionalTrimmedString = (minimum, message) => z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(minimum, message).optional());

export const verifyCodeSchema = z.object({
  accessCode: z.string().regex(/^\d{6}$/, "Access code must be 6 digits."),
});
export const requestEmailOtpSchema = z.object({
  email: z.string().email(),
});
export const verifyEmailOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits."),
});

export const resolveExamCodeSchema = z.object({
  examCode: z.string().regex(/^AR\d{4}$/i, "Exam code must look like AR1234."),
});

export const startPublicExamSchema = z.object({
  examAccessToken: optionalTrimmedString(10, "Exam access token is invalid."),
  emailVerificationToken: optionalTrimmedString(10, "Email verification token is invalid."),
  candidate: z.object({
    fullName: optionalTrimmedString(2, "Full name must be at least 2 characters."),
    email: z.preprocess((value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim().toLowerCase();
      return trimmed === "" ? undefined : trimmed;
    }, z.string().email().optional()),
    phone: optionalTrimmedString(3, "Phone number must be at least 3 characters."),
    identifier: optionalTrimmedString(1, "Identifier is required."),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  acceptedTerms: z.literal(true),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
  browserFingerprint: z.string().min(3).optional(),
});
