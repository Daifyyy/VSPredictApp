import { describe, expect, it } from "vitest";
import type { PredictionRow } from "@/lib/types";
import { computeCountModelAccuracy, computePublishedTipRecord } from "./performance";

function row(over: Partial<PredictionRow> = {}): PredictionRow {
  return {
    fixtureId: 1, leagueId: 39, season: 2026, kickoff: "2026-08-01T18:00:00Z",
    homeTeamId: 1, awayTeamId: 2, homeName: "Home", awayName: "Away", homeLogo: "h", awayLogo: "a",
    available: true, lambdaHome: 1.5, lambdaAway: 1, homeWin: .6, draw: .25, awayWin: .15,
    bttsYes: .5, over25: .5, lowConfidence: false, readinessSample: 8, modelVersion: 1,
    modelContext: "LEAGUE", contextVersion: 1, published1x2Side: "home", published1x2Prob: .6,
    publicationPolicyVersion: 1, publishedAt: "2026-07-31T12:00:00Z", rho: null, sharpen: null,
    calibA: null, calibB: null, status: "FT", homeGoals: 2, awayGoals: 0,
    benchAvailable: false, benchHomeWin: null, benchDraw: null, benchAwayWin: null,
    oddsBookmaker: null, oddsHome: null, oddsDraw: null, oddsAway: null, oddsOver25: null,
    oddsBtts: null, oddsUnder25: null, oddsBttsNo: null, oddsCloseHome: null, oddsCloseDraw: null,
    oddsCloseAway: null, oddsCloseOver25: null, oddsCloseUnder25: null,
    lambdaCornersHome: 5, lambdaCornersAway: 4, lambdaCardsHome: 2.2, lambdaCardsAway: 2.3,
    ...over,
  };
}

describe("computePublishedTipRecord", () => {
  it("počítá jen uložené snapshoty a odděluje čekající", () => {
    const out = computePublishedTipRecord([
      row(),
      row({ fixtureId: 2, homeGoals: 0, awayGoals: 1 }),
      row({ fixtureId: 3, homeGoals: null, awayGoals: null, status: "NS" }),
      row({ fixtureId: 4, published1x2Side: null, published1x2Prob: null, publicationPolicyVersion: null, publishedAt: null }),
    ]);
    expect(out).toMatchObject({ n: 2, hits: 1, hitRate: .5, pending: 1, policyVersions: [1] });
  });
});

describe("computeCountModelAccuracy", () => {
  it("tolerance ±1 zahrne chybu 0 a 1, ale ne 2", () => {
    const rows = [row(), row({ fixtureId: 2 }), row({ fixtureId: 3 })];
    const actual = new Map([
      [1, { corners: 9, cards: 4.5 }],
      [2, { corners: 10, cards: 5.5 }],
      [3, { corners: 11, cards: 6.5 }],
    ]);
    const out = computeCountModelAccuracy(rows, actual);
    expect(out.corners).toMatchObject({ n: 3, withinTolerance: 2, tolerance: 1 });
    expect(out.corners.mae).toBeCloseTo(1);
    expect(out.cards).toMatchObject({ n: 3, withinTolerance: 2 });
  });

  it("chybějící skutečnost nezhorší přesnost, ale sníží pokrytí", () => {
    const out = computeCountModelAccuracy([row(), row({ fixtureId: 2 })], new Map([
      [1, { corners: 9, cards: null }],
    ]));
    expect(out.corners).toMatchObject({ eligible: 2, n: 1, coverage: .5 });
    expect(out.cards).toMatchObject({ eligible: 2, n: 0, coverage: 0 });
  });

  it("vyhodnotí Over/Under proti uložené linii a nemíchá verze", () => {
    const oddsBooks = [{
      id: 1, name: "Sharp", home: null, draw: null, away: null,
      over25: null, under25: null, btts: null, bttsNo: null,
      corners: [{ line: 9.5, over: 1.9, under: 1.9 }],
      cards: [{ line: 4.5, over: 2, under: 2 }],
    }];
    const rows = [
      row({ fixtureId: 1, oddsBooks, countModelVersion: 1, cornerVarianceRatio: 1.2, cardVarianceRatio: 1.2 }),
      row({ fixtureId: 2, oddsBooks, countModelVersion: 0, cornerVarianceRatio: 1.2, cardVarianceRatio: 1.2 }),
    ];
    const actual = new Map([
      [1, { corners: 11, cards: 6 }],
      [2, { corners: 8, cards: 3 }],
    ]);
    const out = computeCountModelAccuracy(rows, actual);
    expect(out.corners.versions.map((version) => version.version)).toEqual([1, 0]);
    expect(out.corners.versions[0]).toMatchObject({ n: 1, lineN: 1, varianceRatio: 1.2 });
    expect(out.corners.versions[0].brier).not.toBeNull();
    expect(out.corners.versions[0].logLoss).not.toBeNull();
    expect(out.corners.versions[0].calibration.reduce((sum, bin) => sum + bin.n, 0)).toBe(1);
    expect(out.corners.versions[0].edgeBands.reduce((sum, band) => sum + band.n, 0)).toBe(1);
  });
});
