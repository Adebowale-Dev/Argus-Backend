import { z } from "zod";

export const verifyCodeSchema = z.object({
  accessCode: z.string().regex(/^\d{6}$/, "Access code must be 6 digits."),
});

export const resolveExamCodeSchema = z.object({
  examCode: z.string().regex(/^AR\d{4}$/i, "Exam code must look like AR1234."),
});

export const startPublicExamSchema = z.object({
  examAccessToken: z.string().min(10),
  candidate: z.object({
    fullName: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(3).optional(),
    identifier: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  acceptedTerms: z.literal(true),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
  browserFingerprint: z.string().min(3).optional(),
});
