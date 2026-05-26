import { z } from "zod";
import { ANTI_CHEAT_EVENTS } from "../../constants/antiCheatEvents.js";
export const logEventSchema = z.object({
  eventType: z.enum(ANTI_CHEAT_EVENTS), description: z.string().max(500).optional(), questionIndex: z.number().int().nonnegative().optional(),
  timeRemaining: z.number().nonnegative().optional(), metadata: z.record(z.string(), z.unknown()).optional(), deviceInfo: z.record(z.string(), z.unknown()).optional()
});
