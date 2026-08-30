import type { BookOdds } from "@/lib/data/apiFootball";
import type { PredictionRow } from "@/lib/types";
import { sharpFair, sharpFairTotal, sharpLineFair } from "./books";
import { overProbNegBin } from "./corners";
import { mainHalfLine } from "./countDistribution";
import { teamTotalProb } from "./teamTotals";

export const MARKET_SIGNAL_POLICY_VERSION = 1;
export const COUNT_MARKET_SIGNAL_POLICY_VERSION = 2;
export type SignalMarket = "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS" | "TEAM_HOME_05" | "TEAM_HOME_15" | "TEAM_AWAY_05" | "TEAM_AWAY_15";
export type SignalSide = "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";

export interface FrozenMarketSignal {
  market: SignalMarket;
  side: SignalSide;
  line: number | null;
  modelProbability: number;
  marketProbability: number;
  publishedTip: boolean;
}

export function marketSignalPolicyVersion(market: SignalMarket): number {
  return market === "CORNERS" || market === "CARDS"
    ? COUNT_MARKET_SIGNAL_POLICY_VERSION
    : MARKET_SIGNAL_POLICY_VERSION;
}

/** Vytvoří tehdejší pohled modelu pouze z jednoho uloženého kurzového snapshotu. */
export function freezeMarketSignals(row: PredictionRow, books: BookOdds[]): FrozenMarketSignal[] {
  const out: FrozenMarketSignal[] = [];
  const oneXtwo = sharpFair(books);
  if (oneXtwo) {
    const candidates = [
      { side: "HOME" as const, model: row.homeWin, market: oneXtwo.home },
      { side: "DRAW" as const, model: row.draw, market: oneXtwo.draw },
      { side: "AWAY" as const, model: row.awayWin, market: oneXtwo.away },
    ].sort((a, b) => b.model - a.model);
    const best = candidates[0];
    out.push({
      market: "1X2",
      side: best.side,
      line: null,
      modelProbability: best.model,
      marketProbability: best.market,
      publishedTip:
        row.publicationPolicyVersion != null &&
        ((best.side === "HOME" && row.published1x2Side === "home") ||
          (best.side === "AWAY" && row.published1x2Side === "away")),
    });
  }

  const total = sharpFairTotal(books);
  if (total) {
    const over = row.over25 >= 0.5;
    out.push({
      market: "OVER_25",
      side: over ? "OVER" : "UNDER",
      line: 2.5,
      modelProbability: over ? row.over25 : 1 - row.over25,
      marketProbability: over ? total.over25 : total.under25,
      publishedTip: false,
    });
  }

  let bttsBook: { yes: number; no: number; overround: number } | null = null;
  for (const book of books) {
    if (book.btts == null || book.bttsNo == null) continue;
    const sum = 1 / book.btts + 1 / book.bttsNo;
    const candidate = { yes: 1 / book.btts / sum, no: 1 / book.bttsNo / sum, overround: sum - 1 };
    if (!bttsBook || candidate.overround < bttsBook.overround) bttsBook = candidate;
  }
  if (bttsBook) {
    const yes = row.bttsYes >= 0.5;
    out.push({
      market: "BTTS",
      side: yes ? "OVER" : "UNDER",
      line: null,
      modelProbability: yes ? row.bttsYes : 1 - row.bttsYes,
      marketProbability: yes ? bttsBook.yes : bttsBook.no,
      publishedTip: false,
    });
  }

  for (const market of ["CORNERS", "CARDS"] as const) {
    const lineMarket = market === "CORNERS" ? "corners" : "cards";
    const line = mainHalfLine(books, lineMarket);
    const home = market === "CORNERS" ? row.lambdaCornersHome : row.lambdaCardsHome;
    const away = market === "CORNERS" ? row.lambdaCornersAway : row.lambdaCardsAway;
    const variance = market === "CORNERS" ? row.cornerVarianceRatio : row.cardVarianceRatio;
    if (line == null || home == null || away == null) continue;
    const fair = sharpLineFair(books, lineMarket, line);
    if (!fair) continue;
    const pOver = overProbNegBin(home + away, line, variance ?? 1.2);
    const over = pOver >= 0.5;
    out.push({
      market,
      side: over ? "OVER" : "UNDER",
      line,
      modelProbability: over ? pOver : 1 - pOver,
      marketProbability: over ? fair.over : fair.under,
      publishedTip: false,
    });
  }
  for (const definition of [
    { market: "TEAM_HOME_05" as const, book: "totalHome" as const, team: "home" as const, line: .5 },
    { market: "TEAM_HOME_15" as const, book: "totalHome" as const, team: "home" as const, line: 1.5 },
    { market: "TEAM_AWAY_05" as const, book: "totalAway" as const, team: "away" as const, line: .5 },
    { market: "TEAM_AWAY_15" as const, book: "totalAway" as const, team: "away" as const, line: 1.5 },
  ]) {
    const fair = sharpLineFair(books, definition.book, definition.line);
    if (!fair) continue;
    out.push({ market: definition.market, side: "OVER", line: definition.line, modelProbability: teamTotalProb(row, definition.team, definition.line), marketProbability: fair.over, publishedTip: false });
  }
  return out;
}

export function marketProbabilityAt(
  books: BookOdds[],
  market: SignalMarket,
  side: SignalSide,
  line: number | null
): number | null {
  if (market === "1X2") {
    const fair = sharpFair(books);
    if (!fair) return null;
    return side === "HOME" ? fair.home : side === "DRAW" ? fair.draw : fair.away;
  }
  if (market === "OVER_25") {
    const fair = sharpFairTotal(books);
    if (!fair) return null;
    return side === "OVER" ? fair.over25 : fair.under25;
  }
  if (market === "BTTS") {
    let best: { yes: number; no: number; overround: number } | null = null;
    for (const book of books) {
      if (book.btts == null || book.bttsNo == null) continue;
      const sum = 1 / book.btts + 1 / book.bttsNo;
      const candidate = { yes: 1 / book.btts / sum, no: 1 / book.bttsNo / sum, overround: sum - 1 };
      if (!best || candidate.overround < best.overround) best = candidate;
    }
    if (!best) return null;
    return side === "OVER" ? best.yes : best.no;
  }
  if (line == null) return null;
  const lineMarket = market === "CORNERS" ? "corners" : market === "CARDS" ? "cards" : market.startsWith("TEAM_HOME") ? "totalHome" : "totalAway";
  const fair = sharpLineFair(books, lineMarket, line);
  if (!fair) return null;
  return side === "OVER" ? fair.over : fair.under;
}
