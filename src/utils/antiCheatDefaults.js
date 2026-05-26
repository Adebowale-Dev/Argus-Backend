import { env } from "../config/env.js";

export const antiCheatDefaults = () => ({
  requireFullscreen: true, detectTabSwitch: true, detectWindowBlur: true, disableRightClick: true,
  disableCopyPaste: true, blockDevToolsShortcuts: true, preventMultipleSessions: true,
  requireWebcam: false, captureSnapshots: false, captureScreenshots: false,
  snapshotIntervalSeconds: 60, screenshotIntervalSeconds: 60,
  maxTabSwitches: env.DEFAULT_MAX_TAB_SWITCHES, maxFullscreenExits: env.DEFAULT_MAX_FULLSCREEN_EXITS,
  maxWindowBlurEvents: env.DEFAULT_MAX_WINDOW_BLUR_EVENTS, maxRefreshAttempts: env.DEFAULT_MAX_REFRESH_ATTEMPTS,
  autoSubmitViolationScore: env.DEFAULT_AUTO_SUBMIT_VIOLATION_SCORE,
  warningViolationScore: env.DEFAULT_WARNING_VIOLATION_SCORE,
  finalWarningViolationScore: env.DEFAULT_FINAL_WARNING_VIOLATION_SCORE,
  maxAwaySeconds: env.DEFAULT_MAX_AWAY_SECONDS
});
