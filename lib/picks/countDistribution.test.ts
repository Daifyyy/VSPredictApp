import { describe, expect, it } from "vitest";
import type { BookOdds } from "@/lib/data/apiFootball";
import {
  chooseCountDirection,
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
  it("hranice 65 % je včetně, 64,9 % nestačí", () => {
    expect(chooseCountDirection(9.5, 0.649, true)).toBeNull();
    expect(chooseCountDirection(9.5, 0.65, true)).toMatchObject({ side: "over" });
    expect(chooseCountDirection(9.5, 0.35, true)).toMatchObject({ side: "under" });
  });

  it("malý nebo low-confidence vzorek směr nevydá", () => {
    expect(chooseCountDirection(4.5, 0.8, false)).toBeNull();
  });

  it("použije jen nejlépe pokrytou půlkovou linii", () => {
    const books = [
      book([{ line: 9, over: 1.9, under: 1.9 }, { line: 9.25, over: 1.9, under: 1.9 }, { line: 10.5, over: 1.9, under: 1.9 }]),
      book([{ line: 10.5, over: 1.8, under: 2 }]),
    ];
    expect(mainHalfLine(books, "corners")).toBe(10.5);
    expect(isHalfLine(9)).toBe(false);
    expect(isHalfLine(9.25)).toBe(false);
    expect(isHalfLine(9.5)).toBe(true);
  });

  it("bez půlkové linie nic nevymýšlí", () => {
    expect(mainHalfLine([book([{ line: 9.25, over: 1.9, under: 1.9 }])], "corners")).toBeNull();
  });
});
