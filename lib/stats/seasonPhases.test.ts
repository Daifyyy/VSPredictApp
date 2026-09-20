import { describe, expect, it } from "vitest";
import { classifyCompetitionRound, SeasonPhaseIndex, summarizeSeasonPhases } from "./seasonPhases";
import type { SeasonResult } from "./seasonResults";
const match: SeasonResult = { fixtureId: 1, leagueId: 144, season: 2025,
  kickoff: new Date("2026-05-20T18:00:00Z"), homeTeamId: 1, awayTeamId: 2,
  homeGoals: 0, awayGoals: 1, context: "LEAGUE", source: "COMPLETED_ELO_HISTORY" };
function payload(round: string) { return [{ fixture: { id: 1, date: match.kickoff.toISOString() },
  league: { id: 144, season: 2025, round }, teams: { home: { id: 1 }, away: { id: 2 } } }]; }
describe("season phases", () => {
  it.each([
    ["Regular Season - 12", "REGULAR_SEASON"], [" Championship Round - 2 ", "CHAMPIONSHIP_STAGE"],
    ["Relegation Group - 1", "RELEGATION_STAGE"], ["Promotion Play-offs - Final", "PLAYOFF"],
    ["Final", "PLAYOFF"], ["Round 12", "UNKNOWN"], [null, "UNKNOWN"],
    ["Conference League Group - 1", "EUROPEAN_STAGE"], ["Relegation - Final", "PLAYOFF"],
  ])("classifies explicit label %s", (round, phase) => expect(classifyCompetitionRound(round)).toBe(phase));
  it("deduplicates evidence without treating cache coverage as complete inventory", () => {
    const index = new SeasonPhaseIndex([match]);
    index.addFixturePayload(payload("Regular Season - 1"), "daily");
    index.addFixturePayload(payload("regular season - 1"), "team");
    expect(index.get(1).status).toBe("RESOLVED");
    expect(index.get(1).evidence).toHaveLength(1);
    expect(summarizeSeasonPhases([match], index, 144, 2025)).toMatchObject({
      phaseCoverage: 1, counts: { REGULAR_SEASON: 1 }, inventoryCoverage: "UNVERIFIED", productionEligible: false,
    });
  });
  it("quarantines conflicting rounds rather than preferring convenient phase", () => {
    const index = new SeasonPhaseIndex([match]);
    index.addFixturePayload(payload("Regular Season - 1"), "daily");
    index.addFixturePayload(payload("Final"), "team");
    expect(index.get(1)).toMatchObject({ phase: "UNKNOWN", status: "CONFLICT" });
  });
  it("requires matching identity, kickoff and season", () => {
    const index = new SeasonPhaseIndex([match]);
    const wrong = payload("Regular Season - 1"); wrong[0].league.season = 2026;
    index.addFixturePayload(wrong, "bad");
    expect(index.rejectedIdentity).toBe(1);
    expect(index.get(1).status).toBe("MISSING");
    index.addFixturePayload(null, "empty");
    index.addFixturePayload([null, {}], "malformed");
    expect(index.get(1).status).toBe("MISSING");
  });
  it("reads only versioned identity-matched prediction metadata", () => {
    const index = new SeasonPhaseIndex([match]);
    index.addPredictionSnapshot({ competition: {
      version: 1, fixtureId: 1, leagueId: 144, season: 2025,
      homeTeamId: 1, awayTeamId: 2, kickoff: match.kickoff.toISOString(), round: "Regular Season - 1",
    } }, "snapshot");
    expect(index.get(1).phase).toBe("REGULAR_SEASON");
    index.addPredictionSnapshot({ competition: { round: "Final" } }, "legacy");
    expect(index.get(1).status).toBe("RESOLVED");
  });
});
