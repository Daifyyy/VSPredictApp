import { describe, expect, it } from "vitest";
import { calibrationCandidateStatus, calibrationTrigger } from "./calibrationSuite";

describe("automatic calibration trigger", () => {
  it("runs only after five new eligible results", () => {
    expect(calibrationTrigger(104, 100)).toEqual({ pending: 4, shouldRun: false });
    expect(calibrationTrigger(105, 100)).toEqual({ pending: 5, shouldRun: true });
    expect(calibrationTrigger(108, 100)).toEqual({ pending: 8, shouldRun: true });
  });

  it("never replaces an active shadow candidate", () => {
    expect(calibrationCandidateStatus(true, false)).toBe("SHADOW");
    expect(calibrationCandidateStatus(true, true)).toBe("CHALLENGER");
    expect(calibrationCandidateStatus(false, false)).toBe("REJECTED");
  });
});
