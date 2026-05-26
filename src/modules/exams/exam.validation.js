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
const examFields = z.object({
  title: z.string().min(2), code: z.string().min(2), course: z.string(), description: z.string().optional(), instructions: z.string().optional(),
  durationMinutes: z.number().int().positive(), startTime: z.coerce.date(), endTime: z.coerce.date(), questions: z.array(z.string()).min(1),
  passMark: z.number().nonnegative(), assignedCandidates: z.array(z.string()).default([]), randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false), allowBackwardNavigation: z.boolean().default(true), showResultImmediately: z.boolean().default(false),
  maxAttempts: z.number().int().positive().default(1), antiCheatSettings: antiCheat
});
export const examSchema = examFields.refine((value) => value.endTime > value.startTime, { message: "End time must be after start time.", path: ["endTime"] });
export const examUpdateSchema = examFields.partial().refine((value) => !value.startTime || !value.endTime || value.endTime > value.startTime, { message: "End time must be after start time.", path: ["endTime"] });
export const assignCandidatesSchema = z.object({ candidateIds: z.array(z.string()).min(1) });
