import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({}));
vi.mock("next-auth/react", () => ({}));
vi.mock("./AppHeader", () => ({ AppHeader: () => null }));
vi.mock("./useCurrentUser", () => ({ useCurrentUser: () => null }));
vi.mock("./PressureFlowPredictions", () => ({ PressureFlowPredictions: () => null }));

import { Stats } from "./StrategyHub";
import { STRATEGY_HUB_CATALOG } from "@/lib/picks/strategyHub";
import { summarizePortfolio } from "@/lib/picks/portfolioStats";

const definition = { ...STRATEGY_HUB_CATALOG.find(item => item.id === "ONE_X_TWO")!, statusLabel: "Výzkum" };

describe("StrategyHub historical metrics", () => {
  it("renders missing history explicitly without zero statistics", () => {
    const html = renderToStaticMarkup(createElement(Stats, { metrics: null, definition }));
    expect(html).toContain("Historický souhrn dosud není připraven");
    expect(html).toContain("nejde o nulovou bilanci");
    expect(html).not.toContain("ROI");
    expect(html).not.toContain("Uzavřeno");
    expect(html).not.toContain("0.00");
    expect(html).not.toContain("<strong");
  });

  it("still renders available metrics normally", () => {
    const html = renderToStaticMarkup(createElement(Stats, { definition, metrics: {
      all: summarizePortfolio([]), recent: summarizePortfolio([]), unit: "SELECTIONS", selectionAccuracy: null,
    } }));
    expect(html).toContain("ROI");
    expect(html).toContain("Uzavřeno");
    expect(html).not.toContain("Historický souhrn dosud není připraven");
  });
});
