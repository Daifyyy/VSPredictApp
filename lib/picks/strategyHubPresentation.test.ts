import { describe, expect, it } from "vitest";
import { STRATEGY_HUB_CATALOG } from "./strategyHub";
import { groupStrategyHubCatalog, ONE_X_TWO_RESEARCH } from "./strategyHubPresentation";

describe("strategy hub presentation", () => {
  it("promotes original Over and one coherent 1X2 entry, with visible experiments", () => {
    const groups = groupStrategyHubCatalog(STRATEGY_HUB_CATALOG);
    expect(groups.primary.map(item => item.id)).toEqual(["OVER_25", "ONE_X_TWO"]);
    expect(groups.experiments.map(item => item.id)).toEqual(["VALUE", "ELO_INTUITION"]);
    expect(groups.secondary.map(item => item.id)).toEqual(["PRESSURE_FLOW_V5", "BTTS_YES", "TEAM_GOALS", "CORNERS", "CARDS_REF", "FOULS"]);
  });

  it("keeps every catalog entry exactly once without changing backend definitions", () => {
    const catalog = STRATEGY_HUB_CATALOG.map(item => Object.freeze({ ...item, statusLabel: "Server status" }));
    const before = JSON.stringify(catalog);
    const groups = groupStrategyHubCatalog(Object.freeze(catalog));
    const entries = [...groups.primary, ...groups.experiments, ...groups.secondary];
    expect(entries).toHaveLength(catalog.length);
    expect(new Set(entries.map(item => item.id)).size).toBe(catalog.length);
    for (const item of catalog) expect(entries).toContain(item);
    expect(JSON.stringify(catalog)).toBe(before);
  });

  it("does not invent entries missing from the supplied catalog", () => {
    expect(groupStrategyHubCatalog([])).toEqual({ primary: [], experiments: [], secondary: [] });
    const groups = groupStrategyHubCatalog([{ id: "FOULS" as const }]);
    expect(groups.secondary).toEqual([{ id: "FOULS" }]);
    expect(groups.primary).toEqual([]);
  });

  it("distinguishes three-way research from selections without announcing deployment", () => {
    expect(ONE_X_TWO_RESEARCH.description).toContain("výhru domácích (1), remízu (X) a výhru hostů (2)");
    expect(ONE_X_TWO_RESEARCH.description).toContain("100 %");
    expect(ONE_X_TWO_RESEARCH.selectionNote).toContain("nikoli výsledky nového plného modelu");
    expect(ONE_X_TWO_RESEARCH.caution).toContain("neoznamuje jeho nasazení");
    expect(ONE_X_TWO_RESEARCH.caution).toContain("nepředstavuje ověřená sázková doporučení");
  });
});
