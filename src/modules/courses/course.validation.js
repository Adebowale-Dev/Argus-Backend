import { z } from "zod";
export const courseSchema = z.object({ title: z.string().min(2), code: z.string().min(2), description: z.string().optional(), department: z.string(), examiners: z.array(z.string()).default([]), candidates: z.array(z.string()).default([]), status: z.enum(["ACTIVE", "INACTIVE"]).optional() });
export const courseUpdateSchema = courseSchema.partial();
