import { describe, expect, it } from "vitest";
import { groupCompetitionFixtures } from "./competitionGrouping";

const fixture = (fixtureId: number, leagueId: number, kickoff: string) => ({
  fixtureId, leagueId, kickoff, leagueName: `Soutěž ${leagueId}`, leagueLogoUrl: "logo",
});

describe("groupCompetitionFixtures", () => {
  it("řadí Evropa → veřejné ligy → reprezentace a zápasy podle času", () => {
    const groups = groupCompetitionFixtures([
      fixture(1, 39, "2026-08-15T18:00:00Z"),
      fixture(2, 5, "2026-08-15T16:00:00Z"),
      fixture(3, 345, "2026-08-15T20:00:00Z"),
      fixture(4, 2, "2026-08-15T19:00:00Z"),
      fixture(5, 39, "2026-08-15T14:00:00Z"),
    ]);
    expect(groups.map((group) => group.leagueId)).toEqual([2, 345, 39, 5]);
    expect(groups.find((group) => group.leagueId === 39)?.fixtures.map((item) => item.fixtureId)).toEqual([5, 1]);
  });
});
