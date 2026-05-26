import { z } from "zod";

export const questionBankSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("PRIVATE"),
});

export const questionBankUpdateSchema = questionBankSchema.partial();
