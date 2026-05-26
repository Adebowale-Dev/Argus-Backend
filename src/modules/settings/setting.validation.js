import { z } from "zod";
export const settingUpdateSchema = z.object({ value: z.unknown(), description: z.string().optional(), isPublic: z.boolean().optional() });
