import { AUTONOMOUS_POLICY_VERSION, LEGACY_OVER_SHADOW_POLICY_VERSION, LEGACY_OVER_SHADOW_STRATEGY } from "./autonomousPortfolio";

/** Presentation/ledger identities, not permission to collect or publish a strategy. */
export const OVER_COHORTS = [
  { id: "current", strategy: "OVER_25", policyVersion: AUTONOMOUS_POLICY_VERSION.OVER_25,
    title: "Over 2,5 · současná pravidla", label: "Současná pravidla", status: "LIVE_TEST",
    rules: "60 % · vzorek 8 · edge 4–12 p. b. · EV 2 %",
    decision: "Srovnávací politika; malý vzorek ani kladné ROI samy nepotvrzují výhodu." },
  { id: "original", strategy: LEGACY_OVER_SHADOW_STRATEGY, policyVersion: LEGACY_OVER_SHADOW_POLICY_VERSION,
    title: "Over 2,5 · původní brána (research)", label: "Původní brána · nový sběr", status: "RESEARCH",
    rules: "60 % · připravenost 6 · edge ≥ 4 p. b. bez stropu · EV ≥ 2 % · 3 vzorky · 15 minut",
    decision: "Nová prospektivní kohorta na opravených datech. Historický profit se nepřenáší; zobrazení nezapíná distribuci tipů." },
  { id: "archive", strategy: "OVER_25", policyVersion: 1,
    title: "Over 2,5 · historická pravidla v1", label: "Archiv původního Overu", status: "RETIRED",
    rules: "60 % · edge 4 p. b. · EV 2 %",
    decision: "Pouze historický audit modelu 7, ligového kontextu v1. Nejde o dnešní tipy ani o důkaz ziskovosti nového sběru." },
] as const;

export type OverCohort = typeof OVER_COHORTS[number]["id"];
export function isOverCohort(value: string): value is OverCohort {
  return OVER_COHORTS.some(item => item.id === value);
}
export function overCohortDefinition(id: OverCohort) {
  return OVER_COHORTS.find(item => item.id === id)!;
}
