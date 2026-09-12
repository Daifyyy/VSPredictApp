import { describe, expect, it } from "vitest";
import { isAllowedStrategyDate, isStrategyHubId, STRATEGY_HUB_CATALOG, STRATEGY_HUB_IDS } from "./strategyHub";

describe("strategy hub catalog", () => {
  it("contains every strategy once and only accumulator strategies build tickets", () => {
    expect(STRATEGY_HUB_CATALOG.map((item) => item.id)).toEqual(STRATEGY_HUB_IDS);
    expect(new Set(STRATEGY_HUB_CATALOG.map((item) => item.id)).size).toBe(STRATEGY_HUB_IDS.length);
    expect(STRATEGY_HUB_CATALOG.filter((item) => item.accumulator).map((item) => item.id)).toEqual(["VALUE", "ELO_INTUITION"]);
  });

  it("validates strategy keys", () => {
    expect(isStrategyHubId("VALUE")).toBe(true);
    expect(isStrategyHubId("CHECKLIST")).toBe(false);
  });

  it("allows only yesterday through seven days ahead", () => {
    expect(isAllowedStrategyDate("2026-09-11", "2026-09-12")).toBe(true);
    expect(isAllowedStrategyDate("2026-09-19", "2026-09-12")).toBe(true);
    expect(isAllowedStrategyDate("2026-09-10", "2026-09-12")).toBe(false);
    expect(isAllowedStrategyDate("2026-09-20", "2026-09-12")).toBe(false);
    expect(isAllowedStrategyDate("not-a-date", "2026-09-12")).toBe(false);
  });
});
