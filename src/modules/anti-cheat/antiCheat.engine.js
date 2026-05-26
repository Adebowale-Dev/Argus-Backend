import { ANTI_CHEAT_POINTS } from "../../constants/antiCheatEvents.js";

const thresholdEvent = {
  TAB_SWITCHED: ["maxTabSwitches", "Maximum tab switch limit exceeded."],
  FULLSCREEN_EXITED: ["maxFullscreenExits", "Maximum fullscreen exit limit exceeded."],
  WINDOW_BLUR: ["maxWindowBlurEvents", "Maximum focus-loss limit exceeded."],
  PAGE_REFRESH_ATTEMPT: ["maxRefreshAttempts", "Maximum refresh attempt limit exceeded."]
};

export const severityForPoints = (points) => points >= 5 ? "CRITICAL" : points >= 3 ? "HIGH" : points >= 2 ? "MEDIUM" : "LOW";
export const decideAction = ({ eventType, occurrenceCount, violationScore, settings, metadata }) => {
  if (eventType === "DUPLICATE_SESSION_ATTEMPT" && metadata?.confirmed !== false) return { action: "AUTO_SUBMIT", reason: "A duplicate examination session was detected." };
  if (["WEBCAM_PERMISSION_DENIED", "WEBCAM_DISABLED"].includes(eventType) && settings.requireWebcam) return { action: "AUTO_SUBMIT", reason: "Required webcam monitoring was disabled." };
  if (eventType === "LONG_AWAY_TIME" && Number(metadata?.awaySeconds) > settings.maxAwaySeconds) return { action: "AUTO_SUBMIT", reason: "Maximum away time exceeded." };
  const limit = thresholdEvent[eventType];
  if (limit && occurrenceCount > settings[limit[0]]) return { action: "AUTO_SUBMIT", reason: limit[1] };
  if (violationScore >= settings.autoSubmitViolationScore) return { action: "AUTO_SUBMIT", reason: "Anti-cheat violation score threshold reached." };
  if (violationScore >= settings.finalWarningViolationScore) return { action: "FINAL_WARNING" };
  if (violationScore >= settings.warningViolationScore) return { action: "WARNING" };
  return { action: "LOG_ONLY" };
};
export const eventPoints = (eventType) => ANTI_CHEAT_POINTS[eventType] ?? 0;
