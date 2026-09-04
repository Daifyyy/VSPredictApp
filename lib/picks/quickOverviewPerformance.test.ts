import { describe, expect, it } from "vitest";
import { quickOverviewOutcome, quickOverviewSummary } from "./quickOverviewPerformance";

const kickoff = new Date("2026-09-03T18:00:00Z");
const row = (value: Partial<Parameters<typeof quickOverviewSummary>[0][number]> = {}) => ({
  category: "1x2", policyVersion: 2, qualifiedAt: new Date("2026-09-03T12:00:00Z"), kickoff,
  hit: true, decimalOdds: 2, marketProbability: .5, closingMarketProbability: .55,
  closedAt: new Date("2026-09-03T17:00:00Z"), ...value,
});

describe("quickOverviewSummary", () => {
  it("vyhodnotí výsledkové i početní trhy proti zmrazené straně a linii", () => {
    expect(quickOverviewOutcome({ market: "1X2", side: "HOME", line: null, homeGoals: 2, awayGoals: 1 })).toBe(true);
    expect(quickOverviewOutcome({ market: "CORNERS", side: "UNDER", line: 9.5, homeGoals: 1, awayGoals: 0, actualCount: 8 })).toBe(true);
    expect(quickOverviewOutcome({ market: "CARDS", side: "OVER", line: 4.5, homeGoals: 1, awayGoals: 0, actualCount: 3 })).toBe(false);
    expect(quickOverviewOutcome({ market: "CARDS", side: "UNDER", line: 4.5, homeGoals: 1, awayGoals: 0, actualCount: 3 })).toBe(true);
    expect(quickOverviewOutcome({ market: "CARDS", side: "OVER", line: 3.5, homeGoals: 1, awayGoals: 0, actualCount: null })).toBeNull();
  });
  it("počítá jednotkové ROI, CLV a drawdown společnou portfolio logikou", () => {
    const result = quickOverviewSummary([row(), row({ hit: false, decimalOdds: 1.8, qualifiedAt: new Date("2026-09-03T13:00:00Z") })]);
    expect(result.settled).toBe(2);
    expect(result.hits).toBe(1);
    expect(result.profit).toBeCloseTo(0);
    expect(result.roi).toBeCloseTo(0);
    expect(result.clvComplete).toBe(2);
    expect(result.positiveClvRate).toBe(1);
  });

  it("nepoužije chybějící kurz v ROI ani pohyb trhu jako další sázku", () => {
    const result = quickOverviewSummary([row({ decimalOdds: null }), row({ category: "market" })]);
    expect(result.total).toBe(1);
    expect(result.settled).toBe(1);
    expect(result.staked).toBe(0);
    expect(result.roi).toBeNull();
  });

  it("vyřadí closing starší než 75 minut", () => {
    const result = quickOverviewSummary([row({ closedAt: new Date("2026-09-03T16:44:00Z") })]);
    expect(result.clvComplete).toBe(0);
  });
});
