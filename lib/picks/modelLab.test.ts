import { describe, expect, it } from "vitest";
import { bankrollSimulation, modelLabSegments, modelLabSummary, type ModelLabLedgerRow } from "./modelLab";
import { STRATEGY_CATALOG, resolveModelLabStatus } from "./modelLab";

function row(overrides: Partial<ModelLabLedgerRow> = {}): ModelLabLedgerRow {
  return {
    id: "1", fixtureId: 1, leagueId: 39, kickoff: new Date("2026-08-01T12:00:00Z"),
    strategy: "OVER_25", policyVersion: 1, market: "OVER_25", side: "OVER", line: 2.5,
    modelProbability: .62, marketProbability: .55, decimalOdds: 2, stake: 1,
    modelContext: "LEAGUE", modelVersion: 7, qualifiedAt: new Date("2026-08-01T10:00:00Z"),
    closingMarketProbability: .58, closedAt: new Date("2026-08-01T11:15:00Z"),
    homeGoals: 2, awayGoals: 1, ...overrides,
  };
}

describe("Model Lab", () => {
  it("retains a published loss but excludes an identity mismatch from model validation", () => {
    const summary = modelLabSummary([row({ storedHit: false, dataWarning: "FIXTURE_IDENTITY_MISMATCH" })]);
    expect(summary.portfolio.settled).toBe(1);
    expect(summary.portfolio.profit).toBe(-1);
    expect(summary.probability.model.n).toBe(0);
    expect(summary.probability.opening.n).toBe(0);
    expect(summary.dataWarnings).toBe(1);
    expect(summary.gates.dataQuality).toBe(false);
  });
  it("does not validate mixed context or count versions", () => {
    expect(modelLabSummary([row({ contextVersion: 1 }), row({ contextVersion: 2 })]).gates.frozenPolicy).toBe(false);
    expect(modelLabSummary([row({ countModelVersion: 1 }), row({ countModelVersion: 2 })]).gates.frozenPolicy).toBe(false);
  });
  it("keeps retired Over history, active v2 and the new research comparator distinct", () => {
    const old = STRATEGY_CATALOG.find((item) => item.strategy === "OVER_25" && item.policyVersion === 1)!;
    const current = STRATEGY_CATALOG.find((item) => item.strategy === "OVER_25" && item.policyVersion === 2)!;
    const challenger = STRATEGY_CATALOG.find((item) => item.strategy === "OVER_25_LEGACY_SHADOW")!;
    expect(old.status).toBe("RETIRED");
    expect(resolveModelLabStatus(old, "LIVE_TEST")).toBe("RETIRED");
    expect(current.status).toBe("LIVE_TEST");
    expect(challenger).toMatchObject({ policyVersion: 1, market: "OVER_25", status: "RESEARCH" });
    expect(resolveModelLabStatus(challenger, "VALIDATED")).toBe("RESEARCH");
    expect(modelLabSummary([row(), row({ strategy: challenger.strategy })]).gates.frozenPolicy).toBe(false);
  });
  it("počítá model a trh na stejné kohortě a ignoruje early closing", () => {
    const result = modelLabSummary([row(), row({ id: "2", fixtureId: 2, closedAt: new Date("2026-08-01T10:00:00Z"), homeGoals: 0, awayGoals: 0 })]);
    expect(result.probability.model.n).toBe(2);
    expect(result.probability.opening.n).toBe(2);
    expect(result.probability.closing.n).toBe(1);
    expect(result.probability.modelOnClosing.n).toBe(1);
    expect(result.portfolio.clvComplete).toBe(1);
  });

  it("does not validate mixed policies or compare invalid opening probabilities",()=>{
    const summary=modelLabSummary([row(),row({id:"2",fixtureId:2,policyVersion:2,marketProbability:NaN})]);
    expect(summary.gates.frozenPolicy).toBe(false);
    expect(summary.probability.model.n).toBe(1);
    expect(summary.probability.opening.n).toBe(1);
  });

  it("simulace bankrollu nemění ledger a Kelly respektuje strop 1 %", () => {
    const rows = [row()];
    expect(bankrollSimulation(rows, "FLAT").final).toBe(101);
    expect(bankrollSimulation(rows, "PERCENT").final).toBe(101);
    expect(bankrollSimulation(rows, "KELLY").final).toBeLessThanOrEqual(101);
    expect(rows[0].stake).toBe(1);
  });

  it("segment pod dvaceti výsledky označí pouze jako popisný", () => {
    const segment = modelLabSegments([row()]).find((item) => item.kind === "league")!;
    expect(segment.groups[0].descriptiveOnly).toBe(true);
  });

  it("vyhodnotí týmový Over proti příslušnému týmu a linii", () => {
    const result = modelLabSummary([row({ market: "TEAM_HOME_15", strategy: "TEAM_GOALS", line: 1.5, homeGoals: 2, awayGoals: 0 })]);
    expect(result.portfolio.hits).toBe(1);
  });
});
