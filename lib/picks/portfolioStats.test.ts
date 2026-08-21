import { describe, expect, it } from "vitest";
import { summarizePortfolio } from "./portfolioStats";

describe("summarizePortfolio", () => {
  it("pocita flat ROI, CLV a drawdown bez zamenu chybejiciho CLV za nulu", () => {
    const out = summarizePortfolio([
      { strategy: "A", stake: 1, odds: 2, hit: true, marketProbability: .5, closingMarketProbability: .55 },
      { strategy: "A", stake: 1, odds: 1.8, hit: false, marketProbability: .55, closingMarketProbability: null },
      { strategy: "A", stake: 1, odds: 2, hit: null, marketProbability: .5, closingMarketProbability: null },
    ]);
    expect(out).toMatchObject({ total: 3, pending: 1, settled: 2, hits: 1, staked: 2, profit: 0, roi: 0, clvComplete: 1, maxDrawdown: 1 });
    expect(out.averageClv).toBeCloseTo(.05);
  });
});
