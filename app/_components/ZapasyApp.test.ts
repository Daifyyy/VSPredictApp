import { describe, expect, it } from "vitest";
import type { FixtureDay, PlayedFixture, UpcomingFixture } from "@/lib/types";
import { mergeTodaySnapshot } from "./ZapasyApp";

const upcoming = (fixtureId: number): UpcomingFixture => ({
  fixtureId,
  leagueId: 39,
  leagueName: "Premier League",
  leagueLogoUrl: "league.png",
  kickoff: "2026-08-13T18:00:00Z",
  home: { id: 1, name: "Home", logoUrl: "home.png" },
  away: { id: 2, name: "Away", logoUrl: "away.png" },
  national: false,
  compareMode: "CLUB",
  homeCompareLeagueId: 39,
  awayCompareLeagueId: 39,
});

const played = (fixtureId: number): PlayedFixture => ({
  ...upcoming(fixtureId),
  homeGoals: 2,
  awayGoals: 1,
  afterExtraTime: false,
});

describe("mergeTodaySnapshot", () => {
  it("moves a freshly finished match from Program to Results", () => {
    const served: FixtureDay = {
      date: "2026-08-13",
      fixtures: [{ ...upcoming(7), homeRank: 3, awayRank: 8 }],
      played: [],
    };
    const fresh: FixtureDay = {
      date: "2026-08-13",
      fixtures: [],
      played: [played(7)],
    };
    const result = mergeTodaySnapshot(served, fresh);
    expect(result.fixtures).toEqual([]);
    expect(result.played.map((fixture) => fixture.fixtureId)).toEqual([7]);
  });

  it("preserves rank and settled-tip context from the server snapshot", () => {
    const tip = {
      side: "home" as const,
      prob: 0.6,
      hit: true,
      published: true as const,
      experimental: false,
      policyVersion: 1,
    };
    const served: FixtureDay = {
      date: "2026-08-13",
      fixtures: [{ ...upcoming(8), homeRank: 2, awayRank: 7 }],
      played: [{ ...played(9), tip }],
    };
    const fresh: FixtureDay = {
      date: "2026-08-13",
      fixtures: [upcoming(8)],
      played: [played(9)],
    };
    const result = mergeTodaySnapshot(served, fresh);
    expect(result.fixtures[0]).toMatchObject({ homeRank: 2, awayRank: 7 });
    expect(result.played[0].tip).toEqual(tip);
  });
});
