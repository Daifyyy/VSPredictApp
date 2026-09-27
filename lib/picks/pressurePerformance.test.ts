import { describe, expect, it } from "vitest";
import { evaluatePressurePerformance, pressurePerformanceObservation, type PressurePerformanceRow } from "./pressurePerformance";
const row = (pressure = {}, rest = {}): PressurePerformanceRow => ({ fixtureId: 1, kickoff: "2026-09-21T12:00:00Z", status: "FT", homeGoals: 1, awayGoals: 0, inputSnapshot: { performancePressure: { version: 5, artifactVersion: 1, context: "LEAGUE", capturedAt: "2026-09-21T10:00:00Z", currentOver25: .6, shadowOver25: .9, marketProbabilities: { OVER_25: .2, BTTS_YES: .3, TEAM_HOME_05: .8, TEAM_HOME_15: .4, TEAM_AWAY_05: .5, TEAM_AWAY_15: .1 }, ...pressure } }, ...rest });
describe("prospective pressure performance", () => {
  it("scores explicitly frozen main probabilities without reconstructing older data", () => {
    const result = evaluatePressurePerformance([row({ mainMarketProbabilities: { BTTS_YES: .7 } }), row({}, { fixtureId: 2 })]).cohorts[0].markets.BTTS_YES;
    expect(result.candidate.n).toBe(2);
    expect(result.baseline.n).toBe(1);
    expect(result.pairedCandidate.n).toBe(1);
    expect(result.baseline.brier).toBeCloseTo(.49);
  });
  it("scores actual v5 rather than inherited shadow, and never reconstructs BTTS", () => {
    const markets = evaluatePressurePerformance([row()]).cohorts[0].markets;
    expect(markets.OVER_25.candidate.brier).toBeCloseTo(.04);
    expect(markets.OVER_25.baseline.brier).toBeCloseTo(.36);
    expect(markets.BTTS_YES.baseline.n).toBe(0);
    expect(markets.BTTS_YES.baselineUnavailable).toBe(1);
    expect(markets.TEAM_HOME_05.candidate.brier).toBeCloseTo(.04);
  });
  it("compares identical rows while retaining unpaired predictions", () => {
    const markets = evaluatePressurePerformance([row(), row({ currentOver25: null }, { fixtureId: 2 })]).cohorts[0].markets;
    expect(markets.OVER_25.candidate.n).toBe(2);
    expect(markets.OVER_25.pairedCandidate.n).toBe(1);
    expect(markets.OVER_25.baseline.n).toBe(1);
  });
  it("separates contexts and artifacts and deduplicates fixtures", () => {
    const result = evaluatePressurePerformance([row(), row(), row({ artifactVersion: 2 }), row({ context: "EURO_CUP" })]);
    expect(result.cohorts).toHaveLength(3);
    expect(result.cohorts.map(c => c.captured)).toEqual([1, 1, 1]);
  });
  it("rejects post-kickoff, unknown timestamp and legacy versions", () => {
    for (const patch of [{ capturedAt: "2026-09-21T12:00:00Z" }, { capturedAt: "bad" }, { version: 3 }]) expect(pressurePerformanceObservation(row(patch))).toBeNull();
  });
  it("does not score live or invalid results, rejects invalid probabilities without clamping", () => {
    expect(evaluatePressurePerformance([row({}, { status: "HT" })]).cohorts[0].settled).toBe(0);
    expect(evaluatePressurePerformance([row({}, { homeGoals: -1 })]).cohorts[0].settled).toBe(0);
    expect(evaluatePressurePerformance([row({ marketProbabilities: { OVER_25: 1.2, BTTS_YES: NaN } })]).cohorts[0].markets.OVER_25.candidate.n).toBe(0);
  });
});
