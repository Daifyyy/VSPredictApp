import { describe, expect, it } from "vitest";
import { buildPedigree } from "./clubPedigree";

describe("club pedigree", () => {
  it("combines league-relative Elo, continuity and European experience", () => {
    const matches = [2023, 2024, 2025, 2026].flatMap((season) => Array.from({ length: 15 }, () => ({ season, context: "LEAGUE", homeTeamId: 1, awayTeamId: 2 }))).concat(Array.from({ length: 20 }, () => ({ season: 2026, context: "EURO_CUP", homeTeamId: 1, awayTeamId: 3 })));
    const result = buildPedigree([{ teamId: 1, leagueId: 39, longRating: 1700, longSample: 80 }, { teamId: 2, leagueId: 39, longRating: 1500, longSample: 80 }, { teamId: 3, leagueId: 39, longRating: 1400, longSample: 10 }], matches, 2026);
    expect(result[0]).toMatchObject({ established: true, seasons: 4, europeanMatches: 20, continuity: 1, europeanExperience: 1 });
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[2].established).toBe(false);
  });
});
