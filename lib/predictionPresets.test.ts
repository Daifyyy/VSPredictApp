import { describe, expect, it } from "vitest";
import { matchesPredictionPreset, predictionPresetReason, type PredictionPresetSignals } from "./predictionPresets";

const signals = (value: number, cards: number | null = value): PredictionPresetSignals => ({
  homeWin: value, awayWin: value, over25: value, bttsYes: value, cardsOver35: cards,
});

describe("prediction presets", () => {
  for (const preset of ["home-60", "away-60", "over25-60", "btts-60", "cards-over35-60"] as const) {
    it(`${preset} accepts 60 % and rejects 59.9 %`, () => {
      expect(matchesPredictionPreset(signals(0.6), preset)).toBe(true);
      expect(matchesPredictionPreset(signals(0.599), preset)).toBe(false);
    });
  }

  it("does not invent a card scenario without lambdas", () => {
    expect(matchesPredictionPreset(signals(0.8, null), "cards-over35-60")).toBe(false);
  });

  it("builds a concise reason", () => {
    expect(predictionPresetReason(signals(0.643), "home-60")).toBe("Domácí 64 %");
    expect(predictionPresetReason(signals(0.681), "cards-over35-60")).toBe("4+ karet 68 %");
  });
});
