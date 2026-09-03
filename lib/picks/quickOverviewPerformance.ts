import { freshClosing } from "./evaluation";
import { binaryOutcome } from "./evaluation";
import { summarizePortfolio } from "./portfolioStats";

export const QUICK_BET_CATEGORIES = ["1x2", "goals", "btts", "corners", "cards"] as const;
export type QuickBetCategory = typeof QUICK_BET_CATEGORIES[number];

export interface QuickPerformanceRow {
  category: string;
  policyVersion: number;
  qualifiedAt: Date;
  kickoff: Date;
  hit: boolean | null;
  decimalOdds: number | null;
  marketProbability: number | null;
  closingMarketProbability: number | null;
  closedAt: Date | null;
}

export function quickOverviewOutcome(input: { market: string | null; side: string | null; line: number | null; homeGoals: number | null; awayGoals: number | null; actualCount?: number | null }) {
  if ((input.market === "CORNERS" || input.market === "CARDS") && input.line != null && input.actualCount != null) return input.side === "OVER" ? input.actualCount > input.line : input.actualCount < input.line;
  return binaryOutcome(input.market ?? "", input.side ?? "", input.homeGoals, input.awayGoals, input.line);
}

export function quickOverviewSummary(rows: QuickPerformanceRow[]) {
  const eligible = rows.filter((row) => QUICK_BET_CATEGORIES.includes(row.category as QuickBetCategory));
  const closes = eligible.map((row) => {
    const close = freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close;
    return { row, close };
  });
  const portfolio = summarizePortfolio(eligible.map((row) => ({
    strategy: `QUICK_${row.category.toUpperCase()}`,
    stake: 1,
    odds: row.decimalOdds,
    hit: row.hit,
    marketProbability: row.marketProbability ?? 0,
    closingMarketProbability: row.marketProbability == null ? null : freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close,
    qualifiedAt: row.qualifiedAt,
  })));
  const comparable = closes.filter((item) => item.close != null && item.row.marketProbability != null);
  return {
    ...portfolio,
    pricedSettled: eligible.filter((row) => row.hit != null && row.decimalOdds != null).length,
    positiveClvRate: comparable.length ? comparable.filter((item) => item.close! > item.row.marketProbability!).length / comparable.length : null,
    closingCompleteness: eligible.length ? comparable.length / eligible.length : 0,
  };
}
