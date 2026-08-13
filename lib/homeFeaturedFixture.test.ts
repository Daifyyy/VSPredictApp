import { describe, expect, it } from "vitest";
import type { UpcomingFixture } from "@/lib/types";
import { chooseFeaturedFixture } from "./homeFeaturedFixture";

function fixture(id: number, leagueId: number, home: string, away: string, over: Partial<UpcomingFixture> = {}): UpcomingFixture {
  return {
    fixtureId: id, leagueId, leagueName: "Liga", leagueLogoUrl: "league.png",
    kickoff: `2026-08-13T${String(10 + id).padStart(2, "0")}:00:00Z`,
    home: { id: id * 2, name: home, logoUrl: "home.png" },
    away: { id: id * 2 + 1, name: away, logoUrl: "away.png" },
    national: false, compareMode: "CLUB", homeCompareLeagueId: leagueId, awayCompareLeagueId: leagueId,
    ...over,
  };
}

describe("chooseFeaturedFixture", () => {
  it("upřednostní slavné derby před běžným zápasem prestižnější ligy", () => {
    const choice = chooseFeaturedFixture([
      fixture(1, 39, "Leeds", "Wolves"),
      fixture(2, 135, "Inter", "AC Milan"),
    ]);
    expect(choice?.fixture.fixtureId).toBe(2);
    expect(choice?.title).toBe("Derby della Madonnina");
  });

  it("upřednostní střet dvou velkoklubů před jedním velkým klubem", () => {
    const choice = chooseFeaturedFixture([
      fixture(1, 39, "Arsenal", "Liverpool"),
      fixture(2, 2, "Bayern Munich", "Unknown FC", { europeanCup: true }),
    ]);
    expect(choice?.fixture.fixtureId).toBe(1);
    expect(choice?.title).toBe("Souboj ligových velkoklubů");
  });

  it("živý zápas má prioritu i před derby", () => {
    const choice = chooseFeaturedFixture([
      fixture(1, 39, "Leeds", "Wolves", { live: true }),
      fixture(2, 78, "Bayern Munich", "Borussia Dortmund"),
    ]);
    expect(choice?.fixture.fixtureId).toBe(1);
  });

  it("finále významné soutěže předčí běžný ligový šlágr", () => {
    const choice = chooseFeaturedFixture([
      fixture(1, 39, "Arsenal", "Liverpool"),
      fixture(2, 2, "Club Brugge", "Monaco", { europeanCup: true, competitionRound: "Final" }),
    ]);
    expect(choice?.fixture.fixtureId).toBe(2);
    expect(choice?.title).toBe("Finále · Liga");
  });

  it("při shodě skóre rozhodne dřívější výkop", () => {
    const choice = chooseFeaturedFixture([
      fixture(2, 39, "Leeds", "Wolves"),
      fixture(1, 39, "Fulham", "Brentford"),
    ]);
    expect(choice?.fixture.fixtureId).toBe(1);
  });
});
