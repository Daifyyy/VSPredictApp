import { describe, expect, it } from "vitest";
import { auditCornersLive, type CornerAuditRow } from "./cornersLiveAudit";

function rows(count = 100): CornerAuditRow[] {
  return Array.from({ length: count }, (_, index) => ({
    fixtureId: index,
    leagueId: 39,
    kickoff: new Date(Date.UTC(2026, 0, index + 2)),
    openedAt: new Date(Date.UTC(2026, 0, index + 1)),
    side: "OVER",
    line: 9.5,
    modelProbability: index % 2 ? .7 : .3,
    openingProbability: .5,
    closingProbability: .55,
    actualCount: index % 2 ? 11 : 8,
    actualTeamRows: 2,
    supportedLeague: true,
    modelVersion: 7,
    countModelVersion: 2,
  }));
}

describe("auditCornersLive", () => {
  it("povolí živý test jen s dostatečným a konzistentním holdoutem", () => {
    const result = auditCornersLive(rows());
    expect(result.ready).toBe(true);
    expect(result.comparable).toBe(100);
    expect(result.freshClosings).toBe(100);
    expect(result.holdout.n).toBe(30);
  });

  it("zablokuje chybnou stranu, linii nebo neúplnou skutečnost", () => {
    const input = rows();
    input[0] = { ...input[0], side: "OVER", line: 9, actualTeamRows: 1 };
    const result = auditCornersLive(input);
    expect(result.ready).toBe(false);
    expect(result.gates.integrity).toBe(false);
  });
});
