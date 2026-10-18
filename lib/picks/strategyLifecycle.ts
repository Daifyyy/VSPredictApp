/** Operational switches are not statistical evidence or approval to bet. */
export const FOCUS_PAUSED_STRATEGIES = ["BTTS_YES", "CORNERS", "CARDS_REF", "FOULS", "PRESSURE_FLOW_V5"] as const;
export function strategyFocusModeEnabled() { return process.env.STRATEGY_FOCUS_MODE_ENABLED === "true"; }
export type StrategyLifecycle = "ACTIVE_TEST" | "RESEARCH" | "PAUSED" | "QUARANTINED";
export function strategyLifecycle(strategy: string): { state: StrategyLifecycle; capture: boolean; publish: boolean; reason: string | null } {
  if (strategy === "TEAM_GOALS") return { state: "QUARANTINED", capture: false, publish: false, reason: "TEAM_MARKET_DATA_QUARANTINE" };
  const paused = strategyFocusModeEnabled() && (FOCUS_PAUSED_STRATEGIES as readonly string[]).includes(strategy)
    || strategy === "PRESSURE_FLOW_V5" && (process.env.PRESSURE_SHADOW_COLLECTION_ENABLED === "false" || process.env.PRESSURE_V5_ENABLED === "false");
  if (paused) return { state: "PAUSED", capture: false, publish: false, reason: "STRATEGY_COLLECTION_PAUSED" };
  const researchOnly = strategy === "OVER_25_LEGACY_SHADOW";
  return { state: ["ONE_X_TWO", "OVER_25", "BTTS_YES"].includes(strategy) ? "ACTIVE_TEST" : "RESEARCH", capture: true, publish: !researchOnly, reason: researchOnly ? "RESEARCH_NOT_DISTRIBUTED" : null };
}

/** Only new market-signal capture. Closing/settlement must never use this filter. */
export function captureMarketAllowed(market: string) {
  if (!strategyFocusModeEnabled()) return true;
  return !["BTTS", "CORNERS", "CARDS", "FOULS"].includes(market);
}
