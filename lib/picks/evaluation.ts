import type { ModelReviewTone } from "@/lib/types";

export const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);
export const RELIABLE_CLOSE_MAX_MINUTES = 75;

export function binaryOutcome(
  market: string,
  side: string,
  home: number | null,
  away: number | null,
  line: number | null = null
): boolean | null {
  if (home == null || away == null) return null;
  if (market === "1X2")
    return side === "HOME" ? home > away : side === "AWAY" ? away > home : home === away;
  if (market === "OVER_25") return side === "OVER" ? home + away > 2.5 : home + away < 2.5;
  if (market === "BTTS") return side === "OVER" ? home > 0 && away > 0 : home === 0 || away === 0;
  if (market.startsWith("TEAM_HOME") && line != null) return side === "OVER" ? home > line : home < line;
  if (market.startsWith("TEAM_AWAY") && line != null) return side === "OVER" ? away > line : away < line;
  return null;
}

export function countTone(error: number | null): ModelReviewTone {
  if (error == null) return "neutral";
  if (error <= 1) return "positive";
  if (error <= 2) return "warning";
  return "negative";
}

export function freshClosing(
  kickoff: Date,
  closedAt: Date | null,
  close: number | null
): { close: number | null; fresh: boolean } {
  if (close == null || closedAt == null) return { close: null, fresh: false };
  const minutes = (kickoff.getTime() - closedAt.getTime()) / 60_000;
  return minutes >= 0 && minutes <= RELIABLE_CLOSE_MAX_MINUTES
    ? { close, fresh: true }
    : { close: null, fresh: false };
}

export function portfolioProfit(hit: boolean | null, odds: number | null, stake = 1) {
  if (hit == null || odds == null) return null;
  return hit ? stake * (odds - 1) : -stake;
}
