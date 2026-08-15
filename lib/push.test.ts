import { describe, expect, it } from "vitest";
import { isMeaningfulMarketMove } from "./pushRules";

describe("isMeaningfulMarketMove", () => {
  it("vyžaduje alespoň tři použitelné vzorky", () => {
    expect(isMeaningfulMarketMove({ samples: 2, open: 0.5, current: 0.55, model: 0.6, thresholdPoints: 3 })).toBe(false);
  });

  it("upozorní na dostatečný pohyb směrem k modelu", () => {
    expect(isMeaningfulMarketMove({ samples: 3, open: 0.5, current: 0.54, model: 0.6, thresholdPoints: 3 })).toBe(true);
  });

  it("neupozorní na pohyb od modelu ani pod prahem", () => {
    expect(isMeaningfulMarketMove({ samples: 5, open: 0.5, current: 0.46, model: 0.6, thresholdPoints: 3 })).toBe(false);
    expect(isMeaningfulMarketMove({ samples: 5, open: 0.5, current: 0.52, model: 0.6, thresholdPoints: 3 })).toBe(false);
  });
});
