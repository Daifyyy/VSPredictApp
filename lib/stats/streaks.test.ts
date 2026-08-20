import { describe, expect, it } from "vitest";
import type { MatchStat } from "@/lib/types";
import { formTrend, leadingStreak, pointsPerGame, resultsTimeline } from "./streaks";

const NOW = new Date("2026-08-20T12:00:00Z");

function m(id: number, daysAgo: number, gf: number, ga: number): MatchStat {
  return match(id, daysAgo, gf, ga);
}

function match(id: number, daysAgo: number, goalsFor: number, goalsAgainst: number, isBaseline = false): MatchStat {
  return {
    fixtureId: id,
    date: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    isHome: true,
    isNeutral: false,
    competitive: true,
    season: isBaseline ? 2025 : 2026,
    isBaseline,
    metrics: { GOALS_FOR: goalsFor, GOALS_AGAINST: goalsAgainst },
  };
}

describe("resultsTimeline", () => {
  it("seřadí od nejnovějšího a určí W/D/L", () => {
    const timeline = resultsTimeline([m(1, 3, 0, 1), m(2, 1, 2, 0), m(3, 2, 1, 1)]);
    expect(timeline.map((entry) => entry.result)).toEqual(["W", "D", "L"]);
  });
});

describe("leadingStreak", () => {
  it("spočítá vedoucí sérii bez prohry", () => {
    const timeline = resultsTimeline([
      m(1, 1, 2, 0),
      m(2, 2, 1, 1),
      m(3, 3, 0, 2),
      m(4, 4, 3, 0),
    ]);
    expect(leadingStreak(timeline, (entry) => entry.result !== "L")).toBe(2);
  });

  it("spočítá sérii čistých kont", () => {
    const timeline = resultsTimeline([m(1, 1, 1, 0), m(2, 2, 2, 0), m(3, 3, 1, 1)]);
    expect(leadingStreak(timeline, (entry) => entry.ga === 0)).toBe(2);
  });
});

describe("pointsPerGame", () => {
  it("spočítá vážené body na zápas v okně LAST5", () => {
    const wins = Array.from({ length: 5 }, (_, index) => m(index, index, 2, 0));
    expect(pointsPerGame(wins, "LAST5", NOW)).toBeCloseTo(3, 5);
  });
});

describe("formTrend", () => {
  it("na začátku klubové sezony trend nevytváří ani s bohatou minulou sezonou", () => {
    const matches = [
      match(1, 1, 1, 1), match(2, 8, 1, 0), match(3, 15, 0, 1), match(4, 22, 3, 1),
      ...Array.from({ length: 12 }, (_, index) => match(100 + index, 80 + index * 7, 0, 2, true)),
    ];
    expect(formTrend(matches, "CLUB", NOW)).toEqual({
      form: null, base: null, formSampleSize: 4, baseSampleSize: 0,
    });
  });

  it("porovná poslední čtyři s předchozími čtyřmi aktuální sezony", () => {
    const matches = [
      match(1, 1, 0, 1), match(2, 8, 1, 1), match(3, 15, 0, 2), match(4, 22, 1, 2),
      match(5, 29, 2, 0), match(6, 36, 1, 0), match(7, 43, 3, 1), match(8, 50, 2, 1),
      match(99, 90, 0, 3, true),
    ];
    expect(formTrend(matches, "CLUB", NOW)).toEqual({
      form: 0.25, base: 3, formSampleSize: 4, baseSampleSize: 4,
    });
  });
});
