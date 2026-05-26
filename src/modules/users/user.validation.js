import { z } from "zod";
import { ROLES } from "../../constants/roles.js";
import { PERMISSION_VALUES } from "../../constants/permissions.js";

export const createUserSchema = z.object({
  fullName: z.string().min(2), email: z.string().email(), username: z.string().min(3).optional(),
  password: z.string().min(8), role: z.enum(Object.values(ROLES)),
  permissions: z.array(z.enum(PERMISSION_VALUES)).default([])
});
export const updateUserSchema = z.object({ fullName: z.string().min(2).optional(), username: z.string().min(3).optional(), permissions: z.array(z.enum(PERMISSION_VALUES)).optional(), profileImage: z.string().url().optional(), metadata: z.record(z.string(), z.unknown()).optional() });
export const roleSchema = z.object({ role: z.enum(Object.values(ROLES)), permissions: z.array(z.enum(PERMISSION_VALUES)).optional() });
export const blockSchema = z.object({ reason: z.string().min(3).max(300) });
export const passwordResetSchema = z.object({ temporaryPassword: z.string().min(8) });
