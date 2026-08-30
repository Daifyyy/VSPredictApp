import { describe, expect, it } from "vitest";
import { bankrollSimulation, modelLabSegments, modelLabSummary, type ModelLabLedgerRow } from "./modelLab";

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
  it("počítá model a trh na stejné kohortě a ignoruje early closing", () => {
    const result = modelLabSummary([row(), row({ id: "2", fixtureId: 2, closedAt: new Date("2026-08-01T10:00:00Z"), homeGoals: 0, awayGoals: 0 })]);
    expect(result.probability.model.n).toBe(2);
    expect(result.probability.opening.n).toBe(2);
    expect(result.probability.closing.n).toBe(1);
    expect(result.portfolio.clvComplete).toBe(1);
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
