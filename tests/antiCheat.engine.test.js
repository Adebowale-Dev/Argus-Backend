import { describe, expect, test } from "@jest/globals";
import { decideAction, eventPoints } from "../src/modules/anti-cheat/antiCheat.engine.js";

const settings = { maxTabSwitches: 2, maxFullscreenExits: 2, maxWindowBlurEvents: 2, maxRefreshAttempts: 2, autoSubmitViolationScore: 8, warningViolationScore: 3, finalWarningViolationScore: 5, maxAwaySeconds: 10, requireWebcam: true };

describe("anti-cheat engine", () => {
  test("assigns specified points and warnings", () => {
    expect(eventPoints("TAB_SWITCHED")).toBe(2);
    expect(decideAction({ eventType: "TAB_SWITCHED", occurrenceCount: 1, violationScore: 3, settings })).toEqual({ action: "WARNING" });
  });
  test("auto-submits when tab switches exceed configured maximum", () => {
    expect(decideAction({ eventType: "TAB_SWITCHED", occurrenceCount: 3, violationScore: 6, settings }).action).toBe("AUTO_SUBMIT");
  });
  test("auto-submits confirmed duplicate sessions", () => {
    expect(decideAction({ eventType: "DUPLICATE_SESSION_ATTEMPT", occurrenceCount: 1, violationScore: 5, settings, metadata: { confirmed: true } }).action).toBe("AUTO_SUBMIT");
  });
});
