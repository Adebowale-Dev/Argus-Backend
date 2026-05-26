import { z } from "zod";

const option = z.object({ key: z.string().min(1), text: z.string().min(1) });
export const questionSchema = z.object({
  questionBank: z.string(), questionText: z.string().min(2),
  questionType: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SINGLE_SELECT"]),
  options: z.array(option).min(2), correctAnswer: z.array(z.string()).min(1),
  marks: z.coerce.number().positive().default(1), difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  topic: z.string().optional(), tags: z.array(z.string()).default([]), explanation: z.string().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional()
}).superRefine((value, ctx) => {
  const keys = new Set(value.options.map((item) => item.key));
  if (value.correctAnswer.some((key) => !keys.has(key))) ctx.addIssue({ code: "custom", path: ["correctAnswer"], message: "Correct answers must match option keys." });
});
export const questionUpdateSchema = z.object({
  questionText: z.string().min(2).optional(), questionType: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SINGLE_SELECT"]).optional(),
  options: z.array(option).min(2).optional(), correctAnswer: z.array(z.string()).min(1).optional(),
  questionBank: z.string().optional(), marks: z.coerce.number().positive().optional(), difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(), topic: z.string().optional(),
  tags: z.array(z.string()).optional(),
  explanation: z.string().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional()
}).superRefine((value, ctx) => {
  if (!value.options || !value.correctAnswer) return;
  const keys = new Set(value.options.map((item) => item.key));
  if (value.correctAnswer.some((key) => !keys.has(key))) ctx.addIssue({ code: "custom", path: ["correctAnswer"], message: "Correct answers must match option keys." });
});
export const bulkQuestionsSchema = z.object({ questions: z.array(questionSchema).min(1) });
export const cloneQuestionsSchema = z.object({
  questionBank: z.string(),
  sourceQuestionIds: z.array(z.string()).min(1),
});
