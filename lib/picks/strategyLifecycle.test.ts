import { afterEach, describe, expect, it, vi } from "vitest";
import { captureMarketAllowed, FOCUS_PAUSED_STRATEGIES, strategyLifecycle } from "./strategyLifecycle";
import { pressureShadowMode, pressureV5OpportunitiesEnabled } from "./pressureCollectionPolicy";
afterEach(() => vi.unstubAllEnvs());
describe("strategy focus lifecycle", () => {
  it("is opt-in and keeps operational state separate from statistical validation", () => {
    vi.stubEnv("STRATEGY_FOCUS_MODE_ENABLED", "false");
    expect(strategyLifecycle("BTTS_YES").capture).toBe(true);
    expect(captureMarketAllowed("FOULS")).toBe(true);
    expect(strategyLifecycle("TEAM_GOALS").publish).toBe(false);
  });
  it("pauses only new collection and publication of selected experiments", () => {
    vi.stubEnv("STRATEGY_FOCUS_MODE_ENABLED", "true");
    for (const strategy of FOCUS_PAUSED_STRATEGIES) expect(strategyLifecycle(strategy)).toMatchObject({ state: "PAUSED", capture: false, publish: false });
    for (const strategy of ["VALUE", "ELO_INTUITION", "ONE_X_TWO", "ONE_X_TWO_GUARDED", "OVER_25"]) expect(strategyLifecycle(strategy)).toMatchObject({ capture: true, publish: true });
    expect(strategyLifecycle("OVER_25_LEGACY_SHADOW")).toMatchObject({ capture: true, publish: false });
    for (const market of ["BTTS", "CORNERS", "CARDS", "FOULS"]) expect(captureMarketAllowed(market)).toBe(false);
    for (const market of ["1X2", "OVER_25"]) expect(captureMarketAllowed(market)).toBe(true);
    vi.stubEnv("PRESSURE_SHADOW_COLLECTION_ENABLED", "true");
    vi.stubEnv("PRESSURE_V5_OPPORTUNITIES_ENABLED", "true");
    expect(pressureShadowMode(true, true)).toBe("NONE");
    expect(pressureShadowMode(true, false)).toBe("NONE");
    expect(pressureV5OpportunitiesEnabled()).toBe(false);
  });
});
