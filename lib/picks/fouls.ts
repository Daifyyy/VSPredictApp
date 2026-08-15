import type { MetricValue } from "@/lib/types";
import { DEFAULT_TUNING, strengthRatio, type LeagueBaseline } from "@/lib/stats/predict";

export const FOUL_MODEL_VERSION = 1;
export const DEFAULT_FOUL_MODEL_BASELINE: LeagueBaseline = { home: 10.8, away: 11.3 };

export interface FoulPrediction {
  available: boolean;
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;
}

function expectedFouls(
  team: MetricValue[],
  opponent: MetricValue[],
  isHome: boolean,
  baseline: LeagueBaseline
): number | null {
  const venue = isHome ? "HOME" : "AWAY";
  const opponentVenue = isHome ? "AWAY" : "HOME";
  const ref = isHome ? baseline.home : baseline.away;
  const totalRef = (baseline.home + baseline.away) / 2;
  const committed = strengthRatio(team, "FOULS", venue, ref, totalRef, DEFAULT_TUNING);
  const drawn = strengthRatio(opponent, "FOULS_AGAINST", opponentVenue, ref, totalRef, DEFAULT_TUNING);
  if (!committed && !drawn) return null;
  const value = (committed?.ref ?? drawn!.ref) * (committed?.ratio ?? 1) * (drawn?.ratio ?? 1);
  return Math.min(22, Math.max(4, value));
}

/** Experimentální očekávání faulů. Čte stejná předzápasová okna jako model karet. */
export function predictFouls(
  home: MetricValue[],
  away: MetricValue[],
  baseline: LeagueBaseline = DEFAULT_FOUL_MODEL_BASELINE
): FoulPrediction {
  const rawHome = expectedFouls(home, away, true, baseline);
  const rawAway = expectedFouls(away, home, false, baseline);
  if (rawHome == null || rawAway == null) {
    return { available: false, lambdaHome: 0, lambdaAway: 0, lambdaTotal: 0 };
  }
  // Silný shrink součtu: zatím nemáme samostatný časový holdout jako u rohů a karet.
  const reference = baseline.home + baseline.away;
  const total = reference + (rawHome + rawAway - reference) * 0.35;
  const share = rawHome / (rawHome + rawAway);
  const lambdaHome = total * share;
  const lambdaAway = total - lambdaHome;
  return { available: true, lambdaHome, lambdaAway, lambdaTotal: total };
}
