import { describe, expect, it } from "vitest";
import { marketResidualBaseline } from "./mainModelShadow";

describe("main model v8 shadow baseline", () => {
  it("keeps the market as the dominant baseline and normalizes the result", () => {
    const result = marketResidualBaseline({ market: { home: .5, draw: .3, away: .2 }, source: { home: .7, draw: .2, away: .1 } })!;
    expect(result.weights).toEqual({ market: .7, source: .3, elo: 0 });
    expect(result.probabilities.home).toBeGreaterThan(.5);
    expect(result.probabilities.home).toBeLessThan(.7);
    expect(Object.values(result.probabilities).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("uses prepared Elo only as a bounded ten-percent correction", () => {
    const result = marketResidualBaseline({ market: { home: .5, draw: .3, away: .2 }, source: { home: .55, draw: .25, away: .2 }, elo: { home: .7, draw: .2, away: .1 } })!;
    expect(result.weights).toEqual({ market: .7, source: .2, elo: .1 });
  });

  it("rejects invalid probability inputs", () => {
    expect(marketResidualBaseline({ market: { home: 0, draw: 0, away: 0 }, source: { home: .5, draw: .3, away: .2 } })).toBeNull();
  });
});
