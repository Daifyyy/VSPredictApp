import { describe, expect, it } from "vitest";
import type { MatchStat, MetricValue } from "@/lib/types";
import { blendMetricValues, euroBlendWeight, euroSample } from "./euroBlend";

const match = (fixtureId: number, isBaseline = false): MatchStat => ({
  fixtureId,
  date: `2026-07-${String((fixtureId % 20) + 1).padStart(2, "0")}T18:00:00Z`,
  isHome: true,
  isNeutral: false,
  competitive: true,
  season: isBaseline ? 2025 : 2026,
  isBaseline,
  metrics: { GOALS_FOR: 1 },
});

describe("adaptive European sample", () => {
  it.each([
    [0, 0],
    [1, 0.295],
    [3, 0.385],
    [5, 0.475],
    [8, 0.61],
    [10, 0.7],
    [20, 0.7],
  ])("maps %s effective matches to %s European weight", (sample, expected) => {
    expect(euroBlendWeight(sample)).toBeCloseTo(expected);
  });

  it("counts previous-season matches at half weight", () => {
    const sample = euroSample([
      match(1),
      match(2),
      match(3, true),
      match(4, true),
      match(5, true),
    ]);
    expect(sample).toEqual({ current: 2, previous: 3, effective: 3.5 });
  });

  it("caps the effective sample at ten", () => {
    const matches = Array.from({ length: 20 }, (_, index) => match(index + 1));
    expect(euroSample(matches).effective).toBe(10);
  });
});

describe("metric blending", () => {
  const value = (score: number): MetricValue => ({
    metric: "GOALS_FOR",
    venue: "TOTAL",
    value: score,
    sampleSize: 10,
    lowConfidence: false,
    breakdown: [],
  });

  it("combines separately computed pools without duplicating matches", () => {
    const [result] = blendMetricValues([value(1)], [value(3)], 0.385);
    expect(result.value).toBe(1.77);
  });

  it("keeps an available pool when the other metric is missing", () => {
    const missing = { ...value(0), value: null, sampleSize: 0 };
    expect(blendMetricValues([value(1)], [missing], 0.7)[0].value).toBe(1);
    expect(blendMetricValues([missing], [value(3)], 0.7)[0].value).toBe(3);
  });
});
