import { z } from "zod";
const antiCheat = z.object({
  requireFullscreen: z.boolean().optional(), detectTabSwitch: z.boolean().optional(), detectWindowBlur: z.boolean().optional(),
  disableRightClick: z.boolean().optional(), disableCopyPaste: z.boolean().optional(), blockDevToolsShortcuts: z.boolean().optional(),
  preventMultipleSessions: z.boolean().optional(), requireWebcam: z.boolean().optional(), captureSnapshots: z.boolean().optional(),
  captureScreenshots: z.boolean().optional(), snapshotIntervalSeconds: z.number().positive().optional(), screenshotIntervalSeconds: z.number().positive().optional(),
  maxTabSwitches: z.number().nonnegative().optional(), maxFullscreenExits: z.number().nonnegative().optional(),
  maxWindowBlurEvents: z.number().nonnegative().optional(), maxRefreshAttempts: z.number().nonnegative().optional(),
  autoSubmitViolationScore: z.number().positive().optional(), warningViolationScore: z.number().positive().optional(),
  finalWarningViolationScore: z.number().positive().optional(), maxAwaySeconds: z.number().positive().optional()
}).optional();
const customCandidateField = z.object({
  key: z.string().min(2).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Use a simple field key like company or matricNumber."),
  label: z.string().min(2),
  type: z.enum(["text", "email", "tel", "number"]).default("text"),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
});
const examFields = z.object({
  title: z.string().min(2), code: z.string().min(2).optional(), questionBank: z.string(),
  description: z.string().optional(), instructions: z.string().min(2).optional(),
  durationMinutes: z.number().int().positive(), startTime: z.coerce.date().optional(), endTime: z.coerce.date().optional(),
  availabilityMode: z.enum(["ALWAYS_OPEN", "SCHEDULED", "CLOSED_MANUALLY"]).default("ALWAYS_OPEN"),
  accessType: z.enum(["PUBLIC_LINK_WITH_CODE", "LOGIN_REQUIRED_WITH_CODE", "INVITE_ONLY"]).default("PUBLIC_LINK_WITH_CODE"),
  candidateIdentityRequirements: z.object({ fullName: z.boolean().default(true), email: z.boolean().default(true), phone: z.boolean().default(false), identifier: z.boolean().default(false), customFields: z.array(customCandidateField).default([]) }).default({ fullName: true, email: true, phone: false, identifier: false, customFields: [] }),
  questions: z.array(z.string()).min(1),
  passMark: z.number().nonnegative(), randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false), allowBackwardNavigation: z.boolean().default(true), showResultImmediately: z.boolean().default(false),
  maxAttempts: z.number().int().positive().default(1), maxAttemptsPerCandidate: z.number().int().positive().default(1), antiCheatSettings: antiCheat
});
export const examSchema = examFields
  .refine((value) => value.availabilityMode !== "SCHEDULED" || (value.startTime && value.endTime), { message: "Scheduled exams require start and end time.", path: ["startTime"] })
  .refine((value) => !value.startTime || !value.endTime || value.endTime > value.startTime, { message: "End time must be after start time.", path: ["endTime"] });
export const examUpdateSchema = examFields.partial().refine((value) => !value.startTime || !value.endTime || value.endTime > value.startTime, { message: "End time must be after start time.", path: ["endTime"] });
export const assignCandidatesSchema = z.object({ candidateIds: z.array(z.string()).min(1) });
