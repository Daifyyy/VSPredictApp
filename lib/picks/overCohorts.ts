import { AUTONOMOUS_POLICY_VERSION, LEGACY_OVER_SHADOW_POLICY_VERSION, LEGACY_OVER_SHADOW_STRATEGY } from "./autonomousPortfolio";

/** Presentation/ledger identities, not permission to collect or publish a strategy. */
export const OVER_COHORTS = [
  { id: "current", strategy: "OVER_25", policyVersion: AUTONOMOUS_POLICY_VERSION.OVER_25,
    title: "Over 2,5 · ukončená pravidla v2", label: "Archiv pravidel v2", status: "RETIRED",
    rules: "60 % · vzorek 8 · edge 4–12 p. b. · EV 2 %",
    decision: "Nový sběr a distribuce této větve jsou ukončené. Vydané tipy se dále vyhodnocují; historie se nemaže." },
  { id: "original", strategy: LEGACY_OVER_SHADOW_STRATEGY, policyVersion: LEGACY_OVER_SHADOW_POLICY_VERSION,
    title: "Over 2,5 · původní pravidla", label: "Původní Over · aktivní", status: "LIVE_TEST",
    rules: "60 % · připravenost 6 · edge ≥ 4 p. b. bez stropu · EV ≥ 2 % · 3 vzorky · 15 minut",
    decision: "Aktivní původní kvalifikační pravidla na opravených datech. Dnešní tipy a nová bilance jsou oddělené od historického archivu. Ziskovost není doložená." },
  { id: "archive", strategy: "OVER_25", policyVersion: 1,
    title: "Over 2,5 · historická pravidla v1", label: "Archiv původního Overu", status: "RETIRED",
    rules: "60 % · edge 4 p. b. · EV 2 %",
    decision: "Pouze historický audit modelu 7, ligového kontextu v1. Nejde o dnešní tipy ani o důkaz ziskovosti nového sběru." },
] as const;

export type OverCohort = typeof OVER_COHORTS[number]["id"];
/** UI identity OVER_25 is distinct from the retired ledger identity OVER_25. */
export function defaultStrategyCohort(strategy: string): OverCohort { return strategy === "OVER_25" ? "original" : "current"; }
export function activeStrategySource(strategy: string) { return strategy === "OVER_25" ? LEGACY_OVER_SHADOW_STRATEGY : strategy; }
export function isOverCohort(value: string): value is OverCohort {
  return OVER_COHORTS.some(item => item.id === value);
}
export function overCohortDefinition(id: OverCohort) {
  return OVER_COHORTS.find(item => item.id === id)!;
}
