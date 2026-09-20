import { describe, expect, it } from "vitest";
import { canonicalSeasonResults, seasonResultTotals, type SeasonResultInput } from "./seasonResults";
const cutoff = new Date("2026-09-20T00:00:00Z");
const row: SeasonResultInput = {
  fixtureId: 1, leagueId: 144, season: 2026, kickoff: new Date("2026-09-18T18:00:00Z"),
  homeTeamId: 1, awayTeamId: 2, homeGoals: 0, awayGoals: 1,
  source: "COMPLETED_ELO_HISTORY", context: "LEAGUE",
};
describe("canonical season results", () => {
  it("counts identical cross-source copies only once", () => {
    const result = canonicalSeasonResults([row, { ...row, source: "SETTLED_PREDICTION", status: "FT" }], cutoff);
    expect(result.matches).toHaveLength(1);
    expect(result.duplicateRows).toBe(1);
    expect(seasonResultTotals(result.matches, 144, 2026, cutoff)).toMatchObject({ matches: 1, homeGoals: 0, awayGoals: 1, coverage: "UNKNOWN" });
  });
  it("quarantines conflicting scores regardless of source order", () => {
    for (const rows of [[row, { ...row, awayGoals: 2 }], [{ ...row, awayGoals: 2 }, row]]) {
      expect(canonicalSeasonResults(rows, cutoff).rejected[0].reason).toBe("CONFLICTING_RESULTS");
    }
  });
  it.each(["NS", "PST", "1H", "CANC"])("rejects stale historical result when latest fixture is %s", status => {
    expect(canonicalSeasonResults([row, { ...row, source: "SETTLED_PREDICTION", status }], cutoff).matches).toHaveLength(0);
  });
  it("rejects missing/invalid goals, other contexts and future fixtures", () => {
    for (const r of [{ ...row, homeGoals: null }, { ...row, awayGoals: -1 }, { ...row, context: "EURO_CUP" }, { ...row, kickoff: cutoff }]) {
      expect(canonicalSeasonResults([r], cutoff).matches).toHaveLength(0);
    }
  });
  it("separates seasons and leagues and excludes near-cutoff fixtures", () => {
    const matches = canonicalSeasonResults([row, { ...row, fixtureId: 2, season: 2025 }, { ...row, fixtureId: 3, leagueId: 88 }, { ...row, fixtureId: 4, kickoff: new Date("2026-09-19T22:00:00Z") }], cutoff).matches;
    expect(matches).toHaveLength(3);
    expect(seasonResultTotals(matches, 144, 2026, cutoff).matches).toBe(1);
  });
});
