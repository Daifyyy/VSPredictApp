import { describe, expect, it } from "vitest";
import { summarizePortfolio } from "./portfolioStats";

describe("summarizePortfolio", () => {
  it("pocita flat ROI, CLV a drawdown bez zamenu chybejiciho CLV za nulu", () => {
    const out = summarizePortfolio([
      { strategy: "A", stake: 1, odds: 2, hit: true, marketProbability: .5, closingMarketProbability: .55, kickoff: "2026-01-01T12:00:00Z", closedAt: "2026-01-01T11:30:00Z" },
      { strategy: "A", stake: 1, odds: 1.8, hit: false, marketProbability: .55, closingMarketProbability: null },
      { strategy: "A", stake: 1, odds: 2, hit: null, marketProbability: .5, closingMarketProbability: null },
    ]);
    expect(out).toMatchObject({ total: 3, pending: 1, settled: 2, hits: 1, staked: 2, profit: 0, roi: 0, clvComplete: 1, maxDrawdown: 1 });
    expect(out.averageClv).toBeCloseTo(.05);
  });

  it("pocita chybejici closing do coverage a validuje jen primary panel", () => {
    const base = { strategy: "A", stake: 1, odds: 2, hit: null, marketProbability: .5, closingMarketProbability: null, clvMethodVersion: 2, sameBookClv: true, kickoff: "2026-09-14T12:00:00Z" };
    const out = summarizePortfolio([
      base,
      { ...base, closingMarketProbability: .55, priceClv: .1, closingFreshness: "PRIMARY_30", benchmarkQuality: "PANEL" },
      { ...base, closingMarketProbability: .54, priceClv: .08, closingFreshness: "FALLBACK_75", benchmarkQuality: "PANEL" },
      { ...base, closingMarketProbability: .53, priceClv: .06, closingFreshness: "PRIMARY_30", benchmarkQuality: "PINNACLE_SINGLE" },
    ]);
    expect(out.coverage30).toBe(.5);
    expect(out.coverage75).toBe(.75);
    expect(out.panelCoverage).toBeCloseTo(2 / 3);
    expect(out.averagePriceClv).toBeCloseTo(.1);
  });
});
