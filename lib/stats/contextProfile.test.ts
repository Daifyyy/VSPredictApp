import { describe, expect, it } from "vitest";
import type {
  FormQuality,
  LeagueTable,
  LeagueTableRow,
  MatchPrediction,
  Standing,
  TeamSummary,
} from "@/lib/types";
import { buildContextProfile } from "./contextProfile";

const summary = (form: TeamSummary["form"] = ["W", "W", "D", "W", "L"]): TeamSummary => ({
  venue: "TOTAL",
  form,
  formOpponents: form.map(() => null),
  formSampleSize: form.length,
  cleanSheetPct: 40,
  failedToScorePct: 20,
  sampleSize: 5,
});

const quality = (overrides: Partial<FormQuality> = {}): FormQuality => ({
  venue: "TOTAL",
  matches: [
    { fixtureId: 1, date: "2026-08-01", result: "W", goalsFor: 2, goalsAgainst: 0, xgFor: 1.8, xgAgainst: 0.7, points: 3, expectedPoints: 2.1, edge: 0.9, verdict: "matched" },
    { fixtureId: 2, date: "2026-07-25", result: "W", goalsFor: 1, goalsAgainst: 0, xgFor: 1.3, xgAgainst: 0.8, points: 3, expectedPoints: 1.8, edge: 1.2, verdict: "lucky" },
    { fixtureId: 3, date: "2026-07-18", result: "D", goalsFor: 1, goalsAgainst: 1, xgFor: 1.1, xgAgainst: 0.9, points: 1, expectedPoints: 1.4, edge: -0.4, verdict: "matched" },
    { fixtureId: 4, date: "2026-07-11", result: "W", goalsFor: 3, goalsAgainst: 1, xgFor: 2.2, xgAgainst: 1.0, points: 3, expectedPoints: 2.2, edge: 0.8, verdict: "matched" },
    { fixtureId: 5, date: "2026-07-04", result: "L", goalsFor: 0, goalsAgainst: 2, xgFor: 0.8, xgAgainst: 1.7, points: 0, expectedPoints: 0.7, edge: -0.7, verdict: "matched" },
  ],
  xgSampleSize: 5,
  points: 10,
  expectedPoints: 8.2,
  xgDiffPerMatch: 0.25,
  level: "inline",
  note: "",
  ...overrides,
});

const prediction: MatchPrediction = {
  available: true,
  lambdaHome: 1.1,
  lambdaAway: 1.5,
  lambdaHomeBase: 1.1,
  lambdaAwayBase: 1.5,
  homeWin: 0.35,
  draw: 0.28,
  awayWin: 0.37,
  bttsYes: 0.5,
  over25: 0.45,
  topScores: [],
  lowConfidence: false,
  readiness: { sample: 8, score: 1, level: "ok" },
};

const standing: Standing = {
  rank: 4,
  points: 20,
  goalsDiff: 5,
  form: "WWDWL",
  all: { played: 10, win: 6, draw: 2, lose: 2, goalsFor: 18, goalsAgainst: 13 },
  home: { played: 5, win: 4, draw: 1, lose: 0, goalsFor: 12, goalsAgainst: 4 },
  away: { played: 5, win: 2, draw: 1, lose: 2, goalsFor: 6, goalsAgainst: 9 },
};

function row(teamId: number, rank: number, points: number, goalsDiff: number): LeagueTableRow {
  const played = 5;
  return {
    rank,
    teamId,
    name: `Tým ${teamId}`,
    logoUrl: "",
    played,
    win: Math.floor(points / 3),
    draw: points % 3,
    lose: 0,
    goalsFor: 10 + goalsDiff,
    goalsAgainst: 10,
    goalsDiff,
    points,
    form: null,
    zone: null,
    all: { played, win: Math.floor(points / 3), draw: points % 3, lose: 0, goalsFor: 10 + goalsDiff, goalsAgainst: 10 },
    home: { played: 3, win: 2, draw: 0, lose: 1, goalsFor: 6, goalsAgainst: 3 },
    away: { played: 2, win: 1, draw: 0, lose: 1, goalsFor: 4, goalsAgainst: 3 },
  };
}

const table: LeagueTable = {
  rows: [
    row(2, 1, 15, 8),
    row(3, 2, 13, 6),
    row(4, 3, 10, 2),
    row(1, 4, 14, 7),
    row(5, 5, 5, -2),
    row(6, 6, 2, -8),
  ],
  leagueAvg: null,
};

function profile(overrides: Partial<Parameters<typeof buildContextProfile>[0]> = {}) {
  return buildContextProfile({
    teamId: 1,
    side: "home",
    venue: "TOTAL",
    summary: summary(),
    quality: quality(),
    standing,
    leagueTable: null,
    prediction,
    ...overrides,
  });
}

describe("buildContextProfile", () => {
  it("spočítá body, skóre, xG trend a body na zápas bez dalšího zdroje", () => {
    const result = profile({ venue: "HOME" });
    expect(result.recent).toEqual({
      points: 10,
      maximum: 15,
      sampleSize: 5,
      goalsFor: 7,
      goalsAgainst: 4,
    });
    expect(result.xgDiffPerMatch).toBe(0.25);
    expect(result.pointsPerGame).toBeCloseTo(2.6);
  });

  it("označí černého koně přesně na hranicích a zobrazí nejvýše dva štítky", () => {
    const result = profile({ leagueTable: table });
    expect(result.badges.map((badge) => badge.id)).toEqual([
      "dark-horse",
      "above-standing",
    ]);
  });

  it("nevytvoří černého koně bez čtyř xG zápasů", () => {
    const result = profile({ quality: quality({ xgSampleSize: 3 }) });
    expect(result.badges.some((badge) => badge.id === "dark-horse")).toBe(false);
  });

  it("rozliší výkony nad výsledky a výsledky nad výkony", () => {
    expect(profile({ quality: quality({ level: "underperforming" }), prediction: null }).badges)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "performances-ahead" })]));
    expect(profile({ quality: quality({ level: "overperforming" }), prediction: null }).badges)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "results-ahead", tone: "warning" })]));
  });

  it("označí hledání formy a při chybějících datech vrátí pomlčkové hodnoty", () => {
    const weak = summary(["L", "D", "L", "L"]);
    const result = profile({ summary: weak, quality: null, standing: null, prediction: null });
    expect(result.badges[0].id).toBe("seeking-form");
    expect(result.recent.goalsFor).toBeNull();
    expect(result.xgDiffPerMatch).toBeNull();
    expect(result.pointsPerGame).toBeNull();
  });

  it("sezonní štítek nevytváří bez celé tabulky", () => {
    expect(profile({ leagueTable: null }).badges.some((badge) => badge.id === "above-standing"))
      .toBe(false);
  });
});
