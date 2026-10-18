import { strategyFocusModeEnabled } from "./strategyLifecycle";
/** Pause new research work, never the settlement of already captured predictions. */
export function pressureShadowCollectionEnabled() {
  return !strategyFocusModeEnabled() && process.env.PRESSURE_SHADOW_COLLECTION_ENABLED !== "false";
}
export function pressureV5CollectionEnabled() {
  return pressureShadowCollectionEnabled() && process.env.PRESSURE_V5_ENABLED !== "false";
}
export function pressureV5OpportunitiesEnabled() {
  return pressureShadowCollectionEnabled() && process.env.PRESSURE_V5_OPPORTUNITIES_ENABLED === "true";
}
export function pressureShadowMode(researchAllowed: boolean, v5BudgetAvailable: boolean): "NONE" | "V5" | "LEGACY" {
  if (!researchAllowed || !pressureShadowCollectionEnabled()) return "NONE";
  return pressureV5CollectionEnabled() && v5BudgetAvailable ? "V5" : "LEGACY";
}
