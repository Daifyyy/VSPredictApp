import { describe, expect, it } from "vitest";
import { resolvedStrategyOutcome } from "./strategyOutcome";

describe("resolvedStrategyOutcome", () => {
  it("derives an older unsettled 1X2 snapshot from the final score", () => {
    expect(resolvedStrategyOutcome({ storedHit: null, market: "1X2", side: "HOME", line: null, homeGoals: 2, awayGoals: 1 })).toBe(true);
  });

  it("derives count markets from the recorded actual count", () => {
    expect(resolvedStrategyOutcome({ storedHit: null, market: "CORNERS", side: "OVER", line: 9.5, homeGoals: 1, awayGoals: 0, actualCount: 11 })).toBe(true);
  });

  it("keeps the immutable stored settlement when present", () => {
    expect(resolvedStrategyOutcome({ storedHit: false, market: "1X2", side: "HOME", line: null, homeGoals: 2, awayGoals: 1 })).toBe(false);
  });
});
