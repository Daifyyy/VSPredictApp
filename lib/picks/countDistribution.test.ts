import { describe, expect, it } from "vitest";
import type { BookOdds } from "@/lib/data/apiFootball";
import {
  buildCountForecast,
  countProbabilities,
  isHalfLine,
  mainHalfLine,
  shortestProbabilityInterval,
  topExactCounts,
} from "./countDistribution";

const book = (corners: { line: number; over: number; under: number }[]): BookOdds => ({
  id: 1,
  name: "Test",
  home: null,
  draw: null,
  away: null,
  over25: null,
  under25: null,
  btts: null,
  bttsNo: null,
  corners,
});

describe("countProbabilities", () => {
  it.each([0.5, 5, 10, 24])("normalizuje rozdělení pro λ=%s", (mean) => {
    const distribution = countProbabilities(mean);
    expect(distribution.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(distribution.every((item) => item.probability >= 0)).toBe(true);
  });

  it("vrátí tři nejpravděpodobnější počty v pevném pořadí", () => {
    const top = topExactCounts(countProbabilities(9.8));
    expect(top).toHaveLength(3);
    expect(top[0].probability).toBeGreaterThanOrEqual(top[1].probability);
    expect(top[1].probability).toBeGreaterThanOrEqual(top[2].probability);
  });

  it("najde nejkratší souvislý interval s alespoň 70 %", () => {
    const probabilities = countProbabilities(9.8);
    const interval = shortestProbabilityInterval(probabilities)!;
    expect(interval.probability).toBeGreaterThanOrEqual(0.7);
    for (let low = interval.low; low <= interval.high; low++) {
      for (let high = low; high <= interval.high; high++) {
        if (high - low >= interval.high - interval.low) continue;
        const mass = probabilities.slice(low, high + 1).reduce((sum, item) => sum + item.probability, 0);
        expect(mass).toBeLessThan(0.7);
      }
    }
  });
});

describe("tržní směr", () => {
  it("porovná model s odmaržovaným trhem bez sázkového prahu", () => {
    const forecast = buildCountForecast(5, 5, {
      books: [book([{ line: 9.5, over: 2, under: 2 }])],
      market: "corners",
      varianceRatio: 1.2,
      version: 1,
      evaluatedSample: 18,
    })!;
    expect(forecast.line).toBe(9.5);
    expect(forecast.marketOverProbability).toBeCloseTo(0.5);
    expect(forecast.overDifference).toBeCloseTo(forecast.overProbability! - 0.5);
    expect(forecast.smallSample).toBe(true);
  });

  it("použije vyrovnanou hlavní půlkovou linii", () => {
    const books = [
      book([{ line: 9, over: 1.9, under: 1.9 }, { line: 9.25, over: 1.9, under: 1.9 }, { line: 10.5, over: 1.9, under: 1.9 }]),
      book([{ line: 10.5, over: 1.8, under: 2 }]),
    ];
    expect(mainHalfLine(books, "corners")).toBe(10.5);
    expect(isHalfLine(9)).toBe(false);
    expect(isHalfLine(9.25)).toBe(false);
    expect(isHalfLine(9.5)).toBe(true);
  });

  it("alternativní téměř jistou linii nezamění za hlavní trh", () => {
    const books = [book([
      { line: 4.5, over: 1.02, under: 15 },
      { line: 8.5, over: 1.92, under: 1.92 },
      { line: 10.5, over: 2.7, under: 1.45 },
    ])];
    expect(mainHalfLine(books, "corners")).toBe(8.5);
  });

  it("bez půlkové linie nic nevymýšlí", () => {
    expect(mainHalfLine([book([{ line: 9.25, over: 1.9, under: 1.9 }])], "corners")).toBeNull();
  });
});
