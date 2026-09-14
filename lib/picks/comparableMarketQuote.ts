import type { BookOdds, LineOdds } from "@/lib/data/apiFootball";

export const CLV_METHOD_VERSION = 2;
export const PRIMARY_CLOSE_MAX_MINUTES = 30;
export const FALLBACK_CLOSE_MAX_MINUTES = 75;
export const CLV_BOOKMAKER_PANEL = [4, 8, 6, 11, 2] as const;

export type BenchmarkQuality = "PANEL" | "PINNACLE_SINGLE" | "CROSS_BOOK" | "UNAVAILABLE";
export type ClosingFreshness = "PRIMARY_30" | "FALLBACK_75" | "STALE";
export type ComparableMarket = "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS" | "FOULS" | "TEAM_HOME" | "TEAM_AWAY" | "MATCH_TOTALS";
export type ComparableSide = "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";

export interface ComparableMarketQuote {
  bookmakerId: number | null;
  bookmaker: string | null;
  decimalOdds: number | null;
  oppositeOdds: number | null;
  fairProbability: number | null;
  line: number | null;
  sampledAt: Date;
  benchmarkQuality: BenchmarkQuality;
  panelSize: number;
}

const logit = (p: number) => Math.log(p / (1 - p));
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function lineQuote(book: BookOdds, market: ComparableMarket, line: number | null): LineOdds | null {
  if (line == null) return null;
  const key = market === "CORNERS" ? "corners" : market === "CARDS" ? "cards" : market === "FOULS" ? "fouls" : market === "TEAM_HOME" ? "totalHome" : market === "TEAM_AWAY" ? "totalAway" : "matchTotals";
  return book[key]?.find((item) => item.line === line) ?? null;
}

function rawPair(book: BookOdds, market: ComparableMarket, side: ComparableSide, line: number | null) {
  if (market === "1X2") {
    if (book.home == null || book.draw == null || book.away == null) return null;
    const sum = 1 / book.home + 1 / book.draw + 1 / book.away;
    const odds = side === "HOME" ? book.home : side === "DRAW" ? book.draw : book.away;
    return { odds, opposite: null, probability: (1 / odds) / sum };
  }
  let over: number | null | undefined;
  let under: number | null | undefined;
  if (market === "OVER_25") { over = book.over25; under = book.under25; }
  else if (market === "BTTS") { over = book.btts; under = book.bttsNo; }
  else { const quote = lineQuote(book, market, line); over = quote?.over; under = quote?.under; }
  if (over == null || under == null) return null;
  const sum = 1 / over + 1 / under;
  const odds = side === "UNDER" ? under : over;
  const opposite = side === "UNDER" ? over : under;
  return { odds, opposite, probability: (1 / odds) / sum };
}

/** A realizable price and a stable, de-vigged benchmark from one fixed bookmaker panel. */
export function comparableMarketQuote(input: {
  books: BookOdds[];
  market: ComparableMarket;
  side: ComparableSide;
  line?: number | null;
  sampledAt: Date;
  allowedBookmakerIds?: readonly number[];
}): ComparableMarketQuote {
  const allowed = input.allowedBookmakerIds ?? CLV_BOOKMAKER_PANEL;
  const available = input.books
    .filter((book) => allowed.includes(book.id))
    .flatMap((book) => { const pair = rawPair(book, input.market, input.side, input.line ?? null); return pair ? [{ book, pair }] : []; });
  const execution = available.reduce<(typeof available)[number] | null>((best, item) => !best || item.pair.odds > best.pair.odds ? item : best, null);
  const panelProbabilities = available.map((item) => item.pair.probability).filter((p) => p > 0 && p < 1);
  const fairProbability = panelProbabilities.length >= 2
    ? logistic(median(panelProbabilities.map(logit)))
    : panelProbabilities.length === 1 && available[0]?.book.id === 4 ? panelProbabilities[0] : null;
  const benchmarkQuality: BenchmarkQuality = panelProbabilities.length >= 2 ? "PANEL" : panelProbabilities.length === 1 && available[0]?.book.id === 4 ? "PINNACLE_SINGLE" : "UNAVAILABLE";
  return {
    bookmakerId: execution?.book.id ?? null,
    bookmaker: execution?.book.name ?? null,
    decimalOdds: execution?.pair.odds ?? null,
    oppositeOdds: execution?.pair.opposite ?? null,
    fairProbability,
    line: input.line ?? null,
    sampledAt: input.sampledAt,
    benchmarkQuality,
    panelSize: panelProbabilities.length,
  };
}

export function closingFreshness(kickoff: Date, sampledAt: Date | null): ClosingFreshness {
  if (!sampledAt) return "STALE";
  const minutes = (kickoff.getTime() - sampledAt.getTime()) / 60_000;
  if (minutes >= 0 && minutes <= PRIMARY_CLOSE_MAX_MINUTES) return "PRIMARY_30";
  if (minutes > PRIMARY_CLOSE_MAX_MINUTES && minutes <= FALLBACK_CLOSE_MAX_MINUTES) return "FALLBACK_75";
  return "STALE";
}

export function clvV2(input: { opening: ComparableMarketQuote; closing: ComparableMarketQuote; kickoff: Date }) {
  const freshness = closingFreshness(input.kickoff, input.closing.sampledAt);
  const sameLine = input.opening.line === input.closing.line;
  const sameBook = input.opening.bookmakerId != null && input.opening.bookmakerId === input.closing.bookmakerId;
  const comparable = freshness !== "STALE" && sameLine && input.closing.fairProbability != null;
  return {
    freshness,
    sameBook,
    sameLine,
    probabilityClv: comparable && input.opening.fairProbability != null ? input.closing.fairProbability! - input.opening.fairProbability : null,
    priceClv: comparable && input.opening.decimalOdds != null ? input.opening.decimalOdds * input.closing.fairProbability! - 1 : null,
    lineMovement: input.opening.line != null && input.closing.line != null ? input.closing.line - input.opening.line : null,
    eligibleForPrimaryGate: comparable && sameBook && freshness === "PRIMARY_30" && input.closing.benchmarkQuality === "PANEL",
  };
}
