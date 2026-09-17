import type { BookOdds } from "@/lib/data/apiFootball";
import { comparableMarketQuote, type ComparableMarket } from "./comparableMarketQuote";
import type { PerformancePressureShadowV5, PressureV5Market } from "./performancePressureShadowV5";

export const PRESSURE_FLOW_V5_POLICY_VERSION = 501;
export const PRESSURE_FLOW_V5_MODEL_VERSION = 5;
export const PRESSURE_FLOW_V5_MARKETS = ["OVER_25", "BTTS", "TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] as const;
export type PressureFlowLedgerMarket = typeof PRESSURE_FLOW_V5_MARKETS[number];

export interface PressureFlowCandidate {
  market: PressureFlowLedgerMarket;
  side: "OVER" | "UNDER";
  line: number | null;
  modelProbability: number;
  marketProbability: number;
  decimalOdds: number;
  bookmakerId: number | null;
  bookmaker: string;
  oppositeOdds: number | null;
  benchmarkQuality: string;
  confidence: number;
  edge: number;
  expectedValue: number;
  score: number;
  eligible: boolean;
  rejection: string | null;
}

const definition = (market: PressureFlowLedgerMarket) => {
  if (market === "OVER_25") return { source: "OVER_25" as PressureV5Market, comparable: "OVER_25" as ComparableMarket, line: 2.5, allowUnder: true };
  if (market === "BTTS") return { source: "BTTS_YES" as PressureV5Market, comparable: "BTTS" as ComparableMarket, line: null, allowUnder: true };
  const home = market.startsWith("TEAM_HOME");
  return { source: market as PressureV5Market, comparable: (home ? "TEAM_HOME" : "TEAM_AWAY") as ComparableMarket, line: market.endsWith("15") ? 1.5 : .5, allowUnder: false };
};

export function pressureFlowCandidates(pressure: PerformancePressureShadowV5, books: BookOdds[], sampledAt: Date): PressureFlowCandidate[] {
  const candidates: PressureFlowCandidate[] = [];
  for (const market of PRESSURE_FLOW_V5_MARKETS) {
    const d = definition(market);
    const pOver = pressure.marketProbabilities[d.source];
    const side: "OVER" | "UNDER" = d.allowUnder && pOver < .5 ? "UNDER" : "OVER";
    const probability = side === "OVER" ? pOver : 1 - pOver;
    const quote = comparableMarketQuote({ books, market: d.comparable, side, line: d.line, sampledAt });
    const odds = quote.decimalOdds;
    const marketProbability = quote.fairProbability;
    if (odds == null || marketProbability == null || !quote.bookmaker) continue;
    const edge = probability - marketProbability;
    const expectedValue = probability * odds - 1;
    let rejection: string | null = null;
    if (odds < 1.5) rejection = "PRICE_TOO_SHORT";
    else if (odds > 3.5) rejection = "PRICE_TOO_HIGH";
    else if (pressure.featureCoverage < .75) rejection = "LOW_FEATURE_COVERAGE";
    else if (pressure.fallbacks.includes("CLIPPED_OUTLIER")) rejection = "CLIPPED_OUTLIER";
    else if (probability < .55) rejection = "LOW_SUCCESS_PROBABILITY";
    else if (edge < .04) rejection = "INSUFFICIENT_EDGE";
    else if (expectedValue < .03) rejection = "INSUFFICIENT_EV";
    candidates.push({ market, side, line: d.line, modelProbability: probability, marketProbability, decimalOdds: odds, bookmakerId: quote.bookmakerId, bookmaker: quote.bookmaker, oppositeOdds: quote.oppositeOdds, benchmarkQuality: quote.benchmarkQuality, confidence: pressure.featureCoverage, edge, expectedValue, score: probability + Math.min(.1, Math.max(0, edge)) * .5 + pressure.featureCoverage * .05, eligible: rejection == null, rejection });
  }
  const match = candidates.filter((row) => row.eligible && row.market === "OVER_25").sort((a, b) => b.score - a.score).slice(0, 1);
  const btts = candidates.filter((row) => row.eligible && row.market === "BTTS").sort((a, b) => b.score - a.score).slice(0, 1);
  const team = candidates.filter((row) => row.eligible && row.market.startsWith("TEAM_")).sort((a, b) => b.score - a.score).slice(0, 1);
  return [...match, ...btts, ...team];
}
