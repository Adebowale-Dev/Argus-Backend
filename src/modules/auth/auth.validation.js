import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().min(3).optional(),
  email: z.string().min(3).optional(),
  password: z.string().min(1),
}).refine((value) => value.identifier || value.email, {
  message: "Email or username is required.",
  path: ["identifier"],
});
export const registerExaminerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(3).optional(),
  password: z.string().min(8),
});
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({ token: z.string().min(20), password: z.string().min(8) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
