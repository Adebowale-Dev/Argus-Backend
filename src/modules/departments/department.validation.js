import { z } from "zod";
export const departmentSchema = z.object({ name: z.string().min(2), code: z.string().min(2), description: z.string().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional() });
export const departmentUpdateSchema = departmentSchema.partial();
