import { describe, expect, it } from "vitest";
import { comparePerformance, signedMetricDelta } from "./performanceTone";

describe("comparePerformance", () => {
  it("dodržuje neutrální toleranci a její hranice", () => {
    expect(comparePerformance(1.25, 1, null, 0.25).tone).toBe("neutral");
    expect(comparePerformance(1.26, 1, null, 0.25).tone).toBe("positive");
    expect(comparePerformance(0.74, 1, null, 0.25).tone).toBe("negative");
  });

  it("obrátí hodnocení u karet", () => {
    expect(comparePerformance(2, 4, 3, 1, true)).toEqual({
      tone: "positive",
      opponentDelta: -2,
      baselineDelta: -1,
    });
    expect(comparePerformance(5, 3, 3, 1, true).tone).toBe("negative");
  });

  it("bez soupeře zachová jen srovnání s průměrem", () => {
    expect(comparePerformance(12, null, 10, 2)).toEqual({
      tone: "unknown",
      opponentDelta: null,
      baselineDelta: 2,
    });
  });

  it("formátuje znaménko", () => {
    expect(signedMetricDelta(1.24)).toBe("+1.2");
    expect(signedMetricDelta(-1.24)).toBe("-1.2");
  });
});
