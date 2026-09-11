import { localDateKey } from "@/lib/competitionGrouping";
import { drawTau, poissonVector } from "@/lib/stats/predict";
import { bestLinePrice, bestPrice, bestResultTotalPrice, parseBooks, sharpFair, sharpLineFair } from "./books";

export const INTUITION_POLICY_VERSION = 2;

const MIN_READINESS_SAMPLE = 6;
const EXTREME_EDGE_SAMPLE = 8;
const EXTREME_WINNER_EDGE = .15;
const MIN_DIRECT_ODDS = 1.6;
const MIN_SYNTHETIC_ODDS = 1.7;
const MAX_LEG_ODDS = 6;
const MIN_DIRECT_EV = .03;
const MIN_SYNTHETIC_EV = .08;
const VALUE_MIN_ODDS = 2.4;
const VALUE_MIN_EV = .08;
const SUPPORT_MIN_PROBABILITY = .48;
const TICKET_MIN_ODDS = 8;
const TICKET_MAX_ODDS = 30;
const TICKET_MIN_EV = .10;

export type IntuitionSource = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  homeWin: number; awayWin: number; lambdaHome: number; lambdaAway: number;
  lowConfidence: boolean; readinessSample: number; oddsBooks: unknown;
  homeGoals?: number | null; awayGoals?: number | null;
};

export type IntuitionCandidate = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  winner: "HOME" | "AWAY"; winnerName: string; total: "OVER" | "UNDER"; line: number;
  role: "VALUE" | "SUPPORT"; score: number; modelProbability: number;
  marketWinnerProbability: number | null; winnerOdds: number | null;
  decimalOdds: number | null; bookmaker: string | null; priceKind: "DIRECT" | "SYNTHETIC" | "NONE"; reason: string; risk: string;
};

export type IntuitionTicket = { slot: number; dateKeys: string[]; odds: number | null; legs: IntuitionCandidate[] };

function scoreProbabilities(row: IntuitionSource, winner: "HOME" | "AWAY", total: "OVER" | "UNDER", line: number) {
  const ph = poissonVector(row.lambdaHome), pa = poissonVector(row.lambdaAway);
  let norm = 0, joint = 0, win = 0, totalProbability = 0;
  for (let h = 0; h < ph.length; h++) for (let a = 0; a < pa.length; a++) {
    const p = ph[h] * pa[a] * drawTau(h, a, row.lambdaHome, row.lambdaAway, -.03);
    norm += p;
    const won = winner === "HOME" ? h > a : a > h;
    const totalHit = total === "OVER" ? h + a > line : h + a < line;
    if (won) win += p;
    if (totalHit) totalProbability += p;
    if (won && totalHit) joint += p;
  }
  return norm ? { joint: joint / norm, win: win / norm, total: totalProbability / norm } : { joint: 0, win: 0, total: 0 };
}

function syntheticPrice(row: IntuitionSource, books: ReturnType<typeof parseBooks>, winner: "HOME" | "AWAY", total: "OVER" | "UNDER", line: number) {
  const side = winner === "HOME" ? "home" : "away";
  const win = bestPrice(books, side);
  const goals = bestLinePrice(books, "matchTotals", line, total.toLowerCase() as "over" | "under");
  const probabilities = scoreProbabilities(row, winner, total, line);
  if (!win || !goals || probabilities.win <= 0 || probabilities.total <= 0) return null;
  const dependence = probabilities.joint / (probabilities.win * probabilities.total);
  if (!Number.isFinite(dependence) || dependence <= 0) return null;
  const winnerFair = sharpFair(books)?.[side] ?? null;
  const totalFairQuote = sharpLineFair(books, "matchTotals", line);
  const totalSide = total.toLowerCase() as "over" | "under";
  const totalFair = totalFairQuote?.[totalSide] ?? null;
  if (winnerFair == null || totalFair == null) return null;
  // Korelaci přebíráme ze skórovací matice, ale okrajové pravděpodobnosti z trhu.
  // Fréchetovy meze zaručí, že výsledná společná pravděpodobnost je matematicky možná.
  const lower = Math.max(0, winnerFair + totalFair - 1);
  const upper = Math.min(winnerFair, totalFair);
  const fairJoint = Math.min(upper, Math.max(lower, dependence * winnerFair * totalFair));
  const winnerMargin = Math.max(1, (1 / win.odds) / winnerFair);
  const totalMargin = Math.max(1, (1 / goals.odds) / totalFair);
  const quotedProbability = Math.min(.99, fairJoint * winnerMargin * totalMargin * 1.05);
  const odds = 1 / quotedProbability;
  return odds > 1 ? { odds, bookmaker: `${win.bookmaker} + ${goals.bookmaker}` } : null;
}

function candidateFor(row: IntuitionSource, winner: "HOME" | "AWAY"): IntuitionCandidate | null {
  if (row.lowConfidence || row.readinessSample < MIN_READINESS_SAMPLE) return null;
  const books = parseBooks(row.oddsBooks);
  const side = winner === "HOME" ? "home" : "away";
  const winProbability = winner === "HOME" ? row.homeWin : row.awayWin;
  const winPrice = bestPrice(books, side);
  if (!winPrice || winPrice.odds > 5.5) return null;
  const fair = sharpFair(books);
  const marketProbability = fair?.[side] ?? null;
  const edge = marketProbability == null ? null : winProbability - marketProbability;
  if (edge != null && edge > EXTREME_WINNER_EDGE && row.readinessSample < EXTREME_EDGE_SAMPLE) return null;
  const valueEligible = winPrice.odds >= 2.5 && edge != null && edge >= .03;
  const supportEligible = winPrice.odds <= 2.2 && winProbability >= .5;
  if (!valueEligible && !supportEligible) return null;

  const totalOptions = valueEligible
    ? ([{ total: "OVER", line: 1.5 }, { total: "UNDER", line: 4.5 }] as const)
    : winProbability >= .72
      ? ([{ total: "UNDER", line: 5.5 }, { total: "UNDER", line: 4.5 }, { total: "OVER", line: 1.5 }] as const)
      : ([{ total: "OVER", line: 1.5 }, { total: "UNDER", line: 4.5 }] as const);
  const options = totalOptions.map((option) => {
    const probability = scoreProbabilities(row, winner, option.total, option.line).joint;
    const direct = bestResultTotalPrice(books, side, option.total.toLowerCase() as "over" | "under", option.line);
    const synthetic = direct ? null : syntheticPrice(row, books, winner, option.total, option.line);
    const price = direct ?? synthetic;
    return { ...option, probability, price, priceKind: direct ? "DIRECT" as const : synthetic ? "SYNTHETIC" as const : "NONE" as const, ev: price ? probability * price.odds - 1 : null };
  });
  const eligible = options.flatMap((option) => {
    if (!option.price || option.ev == null) return [];
    const minOdds = option.priceKind === "DIRECT" ? MIN_DIRECT_ODDS : MIN_SYNTHETIC_ODDS;
    const minEv = option.priceKind === "DIRECT" ? MIN_DIRECT_EV : MIN_SYNTHETIC_EV;
    if (option.price.odds < minOdds || option.price.odds > MAX_LEG_ODDS || option.ev < minEv) return [];
    const role = valueEligible && option.priceKind === "DIRECT" && option.price.odds >= VALUE_MIN_ODDS && option.ev >= VALUE_MIN_EV
      ? "VALUE" as const
      : supportEligible && option.price.odds < VALUE_MIN_ODDS && option.probability >= SUPPORT_MIN_PROBABILITY
        ? "SUPPORT" as const
        : null;
    return role ? [{ ...option, role }] : [];
  }).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));
  const chosen = eligible[0];
  if (!chosen) return null;
  const role = chosen.role;
  const winnerName = winner === "HOME" ? row.homeName : row.awayName;
  const opposition = winner === "HOME" ? row.awayName : row.homeName;
  const score = chosen.probability * 60 + Math.min(chosen.ev ?? 0, .25) * 80 + (chosen.priceKind === "DIRECT" ? 5 : 0) + (role === "VALUE" ? 4 : 0);
  return {
    fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName,
    winner, winnerName, total: chosen.total, line: chosen.line, role, score, modelProbability: chosen.probability,
    marketWinnerProbability: marketProbability, winnerOdds: winPrice.odds, decimalOdds: chosen.price?.odds ?? null,
    bookmaker: chosen.price?.bookmaker ?? null, priceKind: chosen.priceKind,
    reason: role === "VALUE" ? `${winnerName} má proti trhu menší odstup, než naznačuje kurz na výhru.` : `${winnerName} je modelový favorit a gólová hranice odpovídá hlavnímu scénáři zápasu.`,
    risk: role === "VALUE" ? `${opposition} zůstává tržním favoritem; jde o nosnou, rizikovější nohu.` : "Kombinovaná podmínka může selhat i při správně odhadnutém vítězi.",
  };
}

export function rankIntuitionCandidates(rows: IntuitionSource[]) {
  return rows.flatMap((row) => [candidateFor(row, "HOME"), candidateFor(row, "AWAY")])
    .filter((item): item is IntuitionCandidate => item != null)
    .sort((a, b) => b.score - a.score);
}

function ticketMetrics(legs: IntuitionCandidate[]) {
  if (legs.some((leg) => leg.decimalOdds == null)) return null;
  const odds = legs.reduce((value, leg) => value * leg.decimalOdds!, 1);
  const probability = legs.reduce((value, leg) => value * leg.modelProbability, 1);
  return { odds, ev: probability * odds - 1 };
}

function assembleTickets(pool: IntuitionCandidate[]): IntuitionTicket[] {
  const unique = [...new Map(pool.map((item) => [item.fixtureId, item])).values()];
  const anchors = unique.filter((item) => item.role === "VALUE");
  const supports = unique.filter((item) => item.role === "SUPPORT").slice(0, 24);
  if (!anchors.length || supports.length < 2) return [];
  const used = new Set<number>();
  const tickets: IntuitionTicket[] = [];

  for (let slot = 1; slot <= 2; slot++) {
    let best: { legs: IntuitionCandidate[]; odds: number; quality: number } | null = null;
    for (const anchor of anchors) {
      if (used.has(anchor.fixtureId)) continue;
      const available = supports.filter((item) => !used.has(item.fixtureId));
      for (let i = 0; i < available.length; i++) for (let j = i + 1; j < available.length; j++) {
        const variants: IntuitionCandidate[][] = [[anchor, available[i], available[j]]];
        for (let k = j + 1; k < available.length; k++) variants.push([anchor, available[i], available[j], available[k]]);
        for (const legs of variants) {
          const metrics = ticketMetrics(legs);
          if (!metrics || metrics.odds < TICKET_MIN_ODDS || metrics.odds > TICKET_MAX_ODDS || metrics.ev < TICKET_MIN_EV) continue;
          const quality = legs.reduce((sum, leg) => sum + leg.score, 0) - Math.abs(Math.log(metrics.odds / 12)) * 4 - (legs.length - 3);
          if (!best || quality > best.quality) best = { legs, odds: metrics.odds, quality };
        }
      }
    }
    if (!best) break;
    best.legs.forEach((leg) => used.add(leg.fixtureId));
    tickets.push({ slot, dateKeys: [...new Set(best.legs.map((item) => localDateKey(item.kickoff)))], odds: best.odds, legs: best.legs });
  }
  return tickets;
}

export function buildIntuitionTickets(rows: IntuitionSource[], requestedDate: string): IntuitionTicket[] {
  const ranked = rankIntuitionCandidates(rows);
  const firstDay = ranked.filter((item) => localDateKey(item.kickoff) === requestedDate);
  const sameDay = assembleTickets(firstDay);
  if (sameDay.length >= 2) return sameDay;
  const extended = assembleTickets(ranked);
  return extended.length > sameDay.length ? extended : sameDay;
}
