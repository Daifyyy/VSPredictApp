import { describe, expect, it } from "vitest";
import { auditStrategyEvidence, dayBlockInterval, type EvidenceRow, type EvidenceFixture } from "./strategyEvidenceAudit";
const fixture: EvidenceFixture = { fixtureId: 1, homeTeamId: 1, awayTeamId: 2, status: "FT", homeGoals: 2, awayGoals: 1 };
const base: EvidenceRow = { id: "one", fixtureId: 1, leagueId: 39, homeTeamId: 1, awayTeamId: 2,
  strategy: "OVER_25", policyVersion: 2, modelVersion: 7, contextVersion: 1, countModelVersion: null, modelContext: "LEAGUE",
  market: "OVER_25", side: "OVER", line: 2.5, kickoff: "2026-10-01T18:00:00Z", qualifiedAt: "2026-10-01T10:00:00Z", settledAt: "2026-10-01T20:00:00Z",
  decimalOdds: 2, bookmaker: "Book", stake: 1, modelProbability: .65, marketProbability: .5,
  settlementStatus: "SETTLED", hit: true, profit: 1, actualCount: null, clvMethodVersion: 2,
  closedAt: "2026-10-01T17:30:00Z", closingBenchmarkProbability: .55, closingBenchmarkQuality: "PANEL", sameBookClv: true, openingBookmaker: "Book" };
const asOf = "2026-10-18T12:00:00Z";
const run = (row: Partial<EvidenceRow> = {}, f: Partial<EvidenceFixture> = {}) => auditStrategyEvidence([{ ...base, ...row }], [{ ...fixture, ...f }], asOf);
describe("strategy evidence audit", () => {
  it("reconstructs outcome and profit while refusing to certify a small winning sample", () => {
    const report = run();
    expect(report.issues).toEqual([]);
    expect(report.cohorts[0]).toMatchObject({ settled: 1, profit: 1, roi: 1, roiCI95: null, evidence: "NOT_VALIDATED", profitWithoutBestDay: 0 });
  });
  it.each([
    [{ qualifiedAt: base.kickoff }, {}, "NOT_PREMATCH"],
    [{}, { homeTeamId: 999 }, "FIXTURE_IDENTITY_MISMATCH"],
    [{ hit: false, profit: -1 }, {}, "OUTCOME_MISMATCH"],
    [{ profit: 10 }, {}, "PROFIT_MISMATCH"],
    [{ settledAt: "2026-10-19T00:00:00Z" }, {}, "INVALID_SETTLEMENT"],
    [{}, { status: "LIVE" }, "NON_FINAL_FIXTURE"],
    [{ bookmaker: null }, {}, "MISSING_EXECUTION_PRICE"],
  ] as const)("excludes invalid evidence %#", (r, f, reason) => {
    const report = run(r, f); expect(report.issues[0].reasons).toContain(reason); expect(report.cohorts[0].settled).toBe(0);
  });
  it("excludes every duplicate rather than selecting the favorable copy", () => {
    const report = auditStrategyEvidence([base, { ...base, id: "two" }], [fixture], asOf);
    expect(report.issues).toHaveLength(2); expect(report.cohorts[0].settled).toBe(0);
  });
  it("preserves a losing publication in raw accounting even when identity is unsuitable for validation", () => {
    const report = run({ hit: false, profit: -1 }, { homeTeamId: 999 });
    expect(report.cohorts[0]).toMatchObject({ settled: 0, ledger: { settled: 1, profit: -1, roi: -1 } });
  });
  it("keeps missing probability out of both paired denominators, not the financial history", () => {
    const report = run({ marketProbability: NaN });
    expect(report.cohorts[0].paired.n).toBe(0); expect(report.cohorts[0].settled).toBe(1);
  });
  it("does not count void or pending as a loss, but includes matured pending in closing coverage", () => {
    expect(run({ settlementStatus: "VOID", hit: null, profit: 0 }).cohorts[0]).toMatchObject({ settled: 0, void: 1, roi: null });
    const r = run({ settlementStatus: "PENDING", hit: null, profit: null, settledAt: null, closedAt: null });
    expect(r.cohorts[0]).toMatchObject({ settled: 0, pending: 1, roi: null, clv: { denominator: 1, primary: 0 } });
  });
  it.each([[0, 1, 1], [30, 1, 1], [30.01, 0, 1], [75, 0, 1], [75.01, 0, 0], [-1, 0, 0]])("checks actual close timing at %s minutes", (minutes, primary, fallbackIncluded) => {
    const closedAt = new Date(Date.parse(base.kickoff) - minutes * 60000).toISOString();
    expect(run({ closedAt }).cohorts[0].clv).toMatchObject({ primary, fallbackIncluded });
  });
  it("does not accept source book switches as strict CLV evidence", () => {
    expect(run({ openingBookmaker: "Other" }).cohorts[0].clv).toMatchObject({ primary: 1, primaryPanelSameBook: 0, mean: null });
  });
  it("separates model and policy versions", () => {
    const report = auditStrategyEvidence([base, { ...base, id: "old", policyVersion: 1 }], [fixture], asOf);
    expect(report.cohorts).toHaveLength(2);
  });
  it("does not bootstrap many correlated bets from one day as independent evidence", () => {
    expect(dayBlockInterval(Array.from({ length: 200 }, () => base), () => 1)).toBeNull();
  });
});
