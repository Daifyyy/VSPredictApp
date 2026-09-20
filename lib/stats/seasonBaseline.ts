import type { LeagueBaseline } from "./predict";

export interface SeasonGoalTotals { matches: number; homeGoals: number; awayGoals: number }
export interface SeasonBaseline extends LeagueBaseline {
  method: "SEASON_SHRINKAGE_V1";
  currentMatches: number;
  previousMatches: number;
  priorMatches: number;
  currentWeight: number;
  fallback: "NONE" | "PREVIOUS_ONLY" | "CURRENT_ONLY" | "UNAVAILABLE";
}

const valid = (s: SeasonGoalTotals | null): s is SeasonGoalTotals =>
  s != null && Number.isFinite(s.matches) && s.matches > 0 &&
  Number.isFinite(s.homeGoals) && s.homeGoals >= 0 && Number.isFinite(s.awayGoals) && s.awayGoals >= 0;

/** Fixed prior strength; to be evaluated chronologically, never fitted during a request. */
export const SEASON_BASELINE_PRIOR_MATCHES = 100;
export function stabilizedSeasonBaseline(current: SeasonGoalTotals | null, previous: SeasonGoalTotals | null): SeasonBaseline | null {
  const c = valid(current) ? current : null, p = valid(previous) ? previous : null;
  if (!p && (!c || c.matches < 20)) return null;
  const prior = p ? Math.min(SEASON_BASELINE_PRIOR_MATCHES, p.matches) : 0;
  const n = c?.matches ?? 0, denominator = n + prior;
  return {
    home: ((c?.homeGoals ?? 0) + (p ? p.homeGoals / p.matches * prior : 0)) / denominator,
    away: ((c?.awayGoals ?? 0) + (p ? p.awayGoals / p.matches * prior : 0)) / denominator,
    method: "SEASON_SHRINKAGE_V1", currentMatches: n, previousMatches: p?.matches ?? 0,
    priorMatches: prior, currentWeight: n / denominator,
    fallback: !c ? "PREVIOUS_ONLY" : !p ? "CURRENT_ONLY" : "NONE",
  };
}
