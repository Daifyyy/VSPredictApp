import { describe, expect, it } from "vitest";
import type { MetricValue } from "@/lib/types";
import { predictFouls } from "./fouls";

const value = (metric: MetricValue["metric"], venue: MetricValue["venue"], average: number, sampleSize = 10): MetricValue => ({
  metric,
  venue,
  value: average,
  sampleSize,
  lowConfidence: false,
  breakdown: [],
});

describe("predictFouls", () => {
  it("combines committed and opponent-drawn fouls", () => {
    const home = [value("FOULS", "HOME", 14), value("FOULS_AGAINST", "HOME", 12)];
    const away = [value("FOULS", "AWAY", 10), value("FOULS_AGAINST", "AWAY", 15)];
    const result = predictFouls(home, away, { home: 11, away: 11 });
    expect(result.available).toBe(true);
    expect(result.lambdaHome).toBeGreaterThan(result.lambdaAway);
    expect(result.lambdaTotal).toBeGreaterThan(22);
  });

  it("does not invent a forecast without foul history", () => {
    expect(predictFouls([], []).available).toBe(false);
  });

  it("shrinks extreme totals toward the league baseline", () => {
    const high = [value("FOULS", "HOME", 22), value("FOULS_AGAINST", "HOME", 22)];
    const result = predictFouls(high, high, { home: 11, away: 11 });
    expect(result.lambdaTotal).toBeGreaterThan(22);
    expect(result.lambdaTotal).toBeLessThan(44);
  });
});
