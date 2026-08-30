import { describe, expect, it } from "vitest";
import type { BookOdds } from "@/lib/data/apiFootball";
import type { PredictionRow } from "@/lib/types";
import { freezeMarketSignals, marketProbabilityAt } from "./marketSignals";

const books: BookOdds[] = [{
  id: 1,
  name: "Sharp",
  home: 2,
  draw: 4,
  away: 4,
  over25: 1.9,
  under25: 1.9,
  btts: null,
  bttsNo: null,
  corners: [{ line: 9.5, over: 1.9, under: 1.9 }, { line: 4.5, over: 1.05, under: 8 }],
  cards: [{ line: 3.5, over: 2, under: 1.8 }],
  totalHome: [{ line: .5, over: 1.25, under: 4 }, { line: 1.5, over: 2.1, under: 1.7 }],
  totalAway: [{ line: .5, over: 1.5, under: 2.5 }, { line: 1.5, over: 3, under: 1.4 }],
}];

const row = {
  homeWin: 0.58,
  draw: 0.24,
  awayWin: 0.18,
  over25: 0.6,
  lambdaHome: 1.5,
  lambdaAway: 1.1,
  rho: -0.08,
  sharpen: 1,
  lambdaCornersHome: 5,
  lambdaCornersAway: 4.5,
  lambdaCardsHome: 2,
  lambdaCardsAway: 1.8,
  cornerVarianceRatio: 1.2,
  cardVarianceRatio: 1.2,
  publicationPolicyVersion: 1,
  published1x2Side: "home",
} as PredictionRow;

describe("freezeMarketSignals", () => {
  it("zmrazí hlavní i čtyři týmové gólové trhy", () => {
    const signals = freezeMarketSignals(row, books);
    expect(signals.map((signal) => signal.market)).toEqual(["1X2", "OVER_25", "CORNERS", "CARDS", "TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"]);
    expect(signals.find((signal) => signal.market === "1X2")).toMatchObject({ side: "HOME", publishedTip: true });
    expect(signals.find((signal) => signal.market === "CORNERS")?.line).toBe(9.5);
  });

  it("porovnává uzavření na stejné linii a stejné straně", () => {
    expect(marketProbabilityAt(books, "CORNERS", "OVER", 9.5)).toBeCloseTo(0.5);
    expect(marketProbabilityAt(books, "CORNERS", "OVER", 10.5)).toBeNull();
    expect(marketProbabilityAt(books, "TEAM_HOME_15", "OVER", 1.5)).toBeCloseTo(1 / 2.1 / (1 / 2.1 + 1 / 1.7));
  });
});
