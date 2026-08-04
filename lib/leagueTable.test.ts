import { describe, expect, it } from "vitest";
import { leagueRowsForVenue } from "./leagueTable";
import type { LeagueTableRow, StandingSplit } from "./types";

const split = (win: number, draw: number, goalsFor: number, goalsAgainst: number): StandingSplit => ({
  played: win + draw, win, draw, lose: 0, goalsFor, goalsAgainst,
});
const row = (teamId: number, name: string, home: StandingSplit): LeagueTableRow => ({
  rank: teamId, teamId, name, logoUrl: "", played: 0, win: 0, draw: 0, lose: 0,
  goalsFor: 0, goalsAgainst: 0, goalsDiff: 0, points: 0, form: "WWWWW", zone: "champions",
  all: home, home, away: home,
});

describe("leagueRowsForVenue", () => {
  it("přepočítá domácí pořadí a odstraní celkové zóny i formu", () => {
    const rows = [row(1, "A", split(1, 0, 2, 0)), row(2, "B", split(1, 1, 3, 1))];
    const home = leagueRowsForVenue(rows, "HOME");
    expect(home.map((item) => item.teamId)).toEqual([2, 1]);
    expect(home[0]).toMatchObject({ rank: 1, points: 4, zone: null, form: null });
  });
});
