import { z } from "zod";
export const startSchema = z.object({ deviceInfo: z.record(z.string(), z.unknown()).optional(), browserFingerprint: z.string().optional() }).default({});
export const answerSchema = z.object({ questionId: z.string(), answer: z.array(z.string()).default([]), currentQuestionIndex: z.number().int().nonnegative().optional() });
export const submitSchema = z.object({ answers: z.array(answerSchema).optional() }).default({});
export const heartbeatSchema = z.object({ currentQuestionIndex: z.number().int().nonnegative().optional() }).default({});
