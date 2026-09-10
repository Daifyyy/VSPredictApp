import { describe, expect, it } from "vitest";
import type { FixtureDay, LiveScore, PlayedFixture, UpcomingFixture } from "@/lib/types";
import { mergeHistoricalSnapshot, mergeLive, mergeTodaySnapshot } from "./ZapasyApp";

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

describe("mergeHistoricalSnapshot", () => {
  it("uses the complete final fixture list and preserves an existing tip", () => {
    const tip = { side: "home" as const, prob: .6, hit: true, published: true as const, experimental: false, policyVersion: 1 };
    const served: FixtureDay = { date: "2026-08-12", fixtures: [], played: [{ ...played(1), tip }] };
    const fresh: FixtureDay = { date: "2026-08-12", fixtures: [], played: [played(1), played(2)] };
    const result = mergeHistoricalSnapshot(served, fresh);
    expect(result.played.map((fixture) => fixture.fixtureId)).toEqual([1, 2]);
    expect(result.played[0].tip).toEqual(tip);
  });
});

describe("mergeLive", () => {
  it("adds a live fixture that is missing from the daily snapshot", () => {
    const discovered = upcoming(12);
    const score: LiveScore = {
      fixtureId: discovered.fixtureId,
      status: "2H",
      elapsed: 63,
      homeGoals: 1,
      awayGoals: 2,
      halftimeHome: 1,
      halftimeAway: 1,
      fixture: discovered,
    };

    const result = mergeLive([], new Map([[score.fixtureId, score]]), true);

    expect(result).toEqual([
      expect.objectContaining({
        fixtureId: 12,
        live: true,
        elapsed: 63,
        liveHome: 1,
        liveAway: 2,
        liveStatus: "2H",
      }),
    ]);
  });

  it("does not duplicate a live fixture already present in the daily snapshot", () => {
    const fixture = upcoming(13);
    const score: LiveScore = {
      fixtureId: fixture.fixtureId,
      status: "1H",
      elapsed: 22,
      homeGoals: 0,
      awayGoals: 1,
      halftimeHome: null,
      halftimeAway: null,
      fixture,
    };

    const result = mergeLive([fixture], new Map([[score.fixtureId, score]]), true);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fixtureId: 13, live: true, liveAway: 1 });
  });
});
