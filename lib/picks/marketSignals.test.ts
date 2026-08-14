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
}];

const row = {
  homeWin: 0.58,
  draw: 0.24,
  awayWin: 0.18,
  over25: 0.6,
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
  it("zmrazí všechny čtyři trhy a ignoruje nesmyslnou vedlejší rohovou linii", () => {
    const signals = freezeMarketSignals(row, books);
    expect(signals.map((signal) => signal.market)).toEqual(["1X2", "OVER_25", "CORNERS", "CARDS"]);
    expect(signals.find((signal) => signal.market === "1X2")).toMatchObject({ side: "HOME", publishedTip: true });
    expect(signals.find((signal) => signal.market === "CORNERS")?.line).toBe(9.5);
  });

  it("porovnává uzavření na stejné linii a stejné straně", () => {
    expect(marketProbabilityAt(books, "CORNERS", "OVER", 9.5)).toBeCloseTo(0.5);
    expect(marketProbabilityAt(books, "CORNERS", "OVER", 10.5)).toBeNull();
  });
});
