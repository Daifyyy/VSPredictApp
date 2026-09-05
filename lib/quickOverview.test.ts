import { describe, expect, it } from "vitest";
import { frozenQuickSelectionReason, h2hSnapshotCount, newestFrozenQuickRows, quickFocusSelection, rankQuickCandidates, restDaysBetween, scoreQuickCandidate, selectRecentSeasonRows, type QuickCandidate } from "./quickOverview";
import type { PredictionRow } from "./types";

function candidate(overrides: Partial<PredictionRow> = {}): QuickCandidate {
  const row = {
    fixtureId: 1, leagueId: 39, season: 2026, kickoff: "2026-09-01T18:00:00Z",
    homeTeamId: 10, awayTeamId: 20, homeName: "Home", awayName: "Away", homeLogo: "", awayLogo: "",
    available: true, lambdaHome: 1.8, lambdaAway: 0.8, homeWin: .64, draw: .22, awayWin: .14,
    bttsYes: .61, over25: .66, lowConfidence: false, readinessSample: 10, modelVersion: 1,
    status: "NS", homeGoals: null, awayGoals: null, benchAvailable: false, benchHomeWin: null,
    benchDraw: null, benchAwayWin: null, oddsBookmaker: null, oddsHome: null, oddsDraw: null,
    oddsAway: null, oddsOver25: null, oddsBtts: null, oddsUnder25: null, oddsBttsNo: null,
    oddsCloseHome: null, oddsCloseDraw: null, oddsCloseAway: null, oddsCloseOver25: null,
    oddsCloseUnder25: null, rho: null, sharpen: null, calibA: null, calibB: null,
    ...overrides,
  } satisfies PredictionRow;
  return { row, signals: [] };
}

describe("quick overview ranking", () => {
  it("řadí 1X2 podle síly, náskoku a připravenosti", () => {
    const rows = [candidate({ fixtureId: 2, homeWin: .60, draw: .25 }), candidate({ fixtureId: 1, homeWin: .68, draw: .2 })];
    expect(rankQuickCandidates(rows, "1x2")[0].candidate.row.fixtureId).toBe(1);
  });

  it("nezahrne remízu jako hlavní 1X2 výběr", () => {
    expect(scoreQuickCandidate(candidate({ homeWin: .3, draw: .4, awayWin: .3 }), "1x2")).toBeNull();
  });

  it("zmrazí konkrétní stranu i bez dostupného trhu", () => {
    expect(quickFocusSelection(candidate(), "1x2")).toMatchObject({ market: "1X2", side: "HOME", line: null });
    expect(quickFocusSelection(candidate({ over25: .42 }), "goals")).toMatchObject({ market: "OVER_25", side: "UNDER", line: 2.5 });
  });

  it("vybere užitečný týmový gólový scénář a ne pouze samozřejmou nízkou hranici", () => {
    const strong = candidate({ lambdaHome: 2.1, lambdaAway: 0.7 });
    expect(quickFocusSelection(strong, "team_goals")).toMatchObject({ market: "TEAM_HOME_15", side: "OVER", line: 1.5 });
    expect(scoreQuickCandidate(strong, "team_goals")?.reason).toContain("Home Over 1.5");
  });

  it("týmové góly respektují připravenost modelu", () => {
    expect(scoreQuickCandidate(candidate({ lambdaHome: 2.1, readinessSample: 5 }), "team_goals")).toBeNull();
    expect(scoreQuickCandidate(candidate({ lambdaHome: 2.1, lowConfidence: true }), "team_goals")).toBeNull();
  });

  it("1X2 vyžaduje 58 procent a náskok 10 bodů", () => {
    expect(scoreQuickCandidate(candidate({ homeWin: .579, draw: .25, awayWin: .171 }), "1x2")).toBeNull();
    expect(scoreQuickCandidate(candidate({ homeWin: .58, draw: .48, awayWin: -.06 }), "1x2")).not.toBeNull();
    expect(scoreQuickCandidate(candidate({ homeWin: .58, draw: .481, awayWin: -.061 }), "1x2")).toBeNull();
  });

  it("nenabízí neurčitou souhrnnou kategorii", () => {
    expect(scoreQuickCandidate(candidate(), "1x2")?.reason).toContain("Domácí");
  });

  it("zachová u početního trhu zmrazenou stranu místo odvození z pravděpodobnosti", () => {
    const row = candidate();
    row.signals = [{ market: "CARDS", side: "UNDER", line: 4.5, modelProbability: .68, openMarketProbability: .52, currentMarketProbability: .55, samples: 4 }];
    expect(quickFocusSelection(row, "cards")).toMatchObject({ market: "CARDS", side: "UNDER", line: 4.5 });
    expect(scoreQuickCandidate(row, "cards")?.reason).toContain("Under 4.5 · 68 %");
    expect(frozenQuickSelectionReason({ category: "cards", reason: "Over 4.5 · 68 %", side: "UNDER", line: 4.5, modelProbability: .68 }, row)).toBe("Under 4.5 · 68 %");
  });

  it("nízká spolehlivost vyřadí zápas z kvalitativního výběru", () => {
    const ready = scoreQuickCandidate(candidate(), "goals")!;
    const weak = scoreQuickCandidate(candidate({ lowConfidence: true }), "goals");
    expect(ready.score).toBeGreaterThan(0);
    expect(weak).toBeNull();
  });

  it("počítá celé dny odpočinku a bezpečně ošetří chybějící historii", () => {
    expect(restDaysBetween("2026-08-25T18:00:00Z", "2026-08-29T17:59:00Z")).toBe(3);
    expect(restDaysBetween(null, "2026-08-29T18:00:00Z")).toBeNull();
    expect(restDaysBetween("2026-08-30T18:00:00Z", "2026-08-29T18:00:00Z")).toBe(0);
  });
  it("selects only the current season before kickoff", () => {
    const rows = [
      { teamId: 10, season: 2025, date: new Date("2026-05-20T18:00:00Z"), id: "old" },
      { teamId: 10, season: 2026, date: new Date("2026-08-20T18:00:00Z"), id: "current" },
      { teamId: 10, season: 2026, date: new Date("2026-08-30T18:00:00Z"), id: "future" },
      { teamId: 20, season: 2026, date: new Date("2026-08-21T18:00:00Z"), id: "other-team" },
    ];
    expect(selectRecentSeasonRows(rows, 10, 2026, "2026-08-29T18:00:00Z").map((row) => row.id)).toEqual(["current"]);
  });
  it("reads H2H count from a prediction snapshot", () => {
    expect(h2hSnapshotCount({ sample: 2 })).toBe(2);
    expect(h2hSnapshotCount({ meetings: [{}, {}] })).toBe(2);
    expect(h2hSnapshotCount(null)).toBe(0);
  });
  it("zachová historický v1 výběr bez leagueId, pokud jeho zápas patří do podporované ligy", () => {
    const rows = [
      { fixtureId: 1, category: "1x2", policyVersion: 1, leagueId: null },
      { fixtureId: 2, category: "1x2", policyVersion: 2, leagueId: 999 },
      { fixtureId: 1, category: "market", policyVersion: 1, leagueId: null },
    ];
    expect(newestFrozenQuickRows(rows, new Set([1]))).toEqual([rows[0]]);
  });
});
