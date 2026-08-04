import { describe, expect, it } from "vitest";
import { normalizeTeamQuery, searchTeams, type SearchableTeam } from "./teamSearch";

const teams: SearchableTeam[] = [
  { id: 1, name: "Sparta Praha", logoUrl: "", leagueId: 345, leagueName: "Fortuna Liga", country: "Česko" },
  { id: 2, name: "Spartak Trnava", logoUrl: "", leagueId: 1, leagueName: "Liga A", country: "Slovensko" },
  { id: 3, name: "Praha United", logoUrl: "", leagueId: 2, leagueName: "Liga B", country: "Česko" },
  { id: 4, name: "Sparta Praha", logoUrl: "", leagueId: 3, leagueName: "Liga C", country: "Česko" },
];

describe("teamSearch", () => {
  it("normalizuje diakritiku, velikost a mezery", () => {
    expect(normalizeTeamQuery("  SPÁRTA   PRAHA ")).toBe("sparta praha");
  });

  it("řadí přesnou shodu před začátek a částečnou shodu", () => {
    expect(searchTeams(teams, "Sparta Praha").map((team) => team.id)).toEqual([1, 4]);
    expect(searchTeams(teams, "praha").map((team) => team.id)).toEqual([3, 1, 4]);
  });

  it("zachová stejnojmenné týmy z různých lig a respektuje limit", () => {
    expect(searchTeams(teams, "sparta", 1)).toHaveLength(1);
    expect(searchTeams(teams, "sparta", 8).map((team) => team.leagueId)).toEqual([345, 3, 1]);
  });

  it("pro jeden znak nic nevrátí", () => {
    expect(searchTeams(teams, "s")).toEqual([]);
  });
});
