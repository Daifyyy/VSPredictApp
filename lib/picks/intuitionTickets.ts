import { localDateKey } from "@/lib/competitionGrouping";
import { drawTau, poissonVector } from "@/lib/stats/predict";
import { bestPrice, bestResultTotalPrice, parseBooks, sharpFair } from "./books";

export const INTUITION_POLICY_VERSION = 1;

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
  decimalOdds: number | null; bookmaker: string | null; reason: string; risk: string;
};

export type IntuitionTicket = { slot: number; dateKeys: string[]; odds: number | null; legs: IntuitionCandidate[] };

function jointProbability(row: IntuitionSource, winner: "HOME" | "AWAY", total: "OVER" | "UNDER", line: number) {
  const ph = poissonVector(row.lambdaHome), pa = poissonVector(row.lambdaAway);
  let norm = 0, hit = 0;
  for (let h = 0; h < ph.length; h++) for (let a = 0; a < pa.length; a++) {
    const p = ph[h] * pa[a] * drawTau(h, a, row.lambdaHome, row.lambdaAway, -.03);
    norm += p;
    const won = winner === "HOME" ? h > a : a > h;
    const totalHit = total === "OVER" ? h + a > line : h + a < line;
    if (won && totalHit) hit += p;
  }
  return norm ? hit / norm : 0;
}

function candidateFor(row: IntuitionSource, winner: "HOME" | "AWAY"): IntuitionCandidate | null {
  if (row.lowConfidence || row.readinessSample < 4) return null;
  const books = parseBooks(row.oddsBooks);
  const side = winner === "HOME" ? "home" : "away";
  const winProbability = winner === "HOME" ? row.homeWin : row.awayWin;
  const winPrice = bestPrice(books, side);
  if (!winPrice || winPrice.odds > 5.5) return null;
  const fair = sharpFair(books);
  const marketProbability = fair?.[side] ?? null;
  const edge = marketProbability == null ? null : winProbability - marketProbability;
  const role = winPrice.odds >= 2.5 && edge != null && edge >= .03 ? "VALUE" : winPrice.odds <= 2.2 && winProbability >= .5 ? "SUPPORT" : null;
  if (!role) return null;

  const totalOptions = role === "VALUE"
    ? ([{ total: "OVER", line: 1.5 }, { total: "UNDER", line: 4.5 }] as const)
    : winProbability >= .72
      ? ([{ total: "UNDER", line: 5.5 }, { total: "UNDER", line: 4.5 }, { total: "OVER", line: 1.5 }] as const)
      : ([{ total: "OVER", line: 1.5 }, { total: "UNDER", line: 4.5 }] as const);
  const options = totalOptions.map((option) => {
    const probability = jointProbability(row, winner, option.total, option.line);
    const price = bestResultTotalPrice(books, side, option.total.toLowerCase() as "over" | "under", option.line);
    return { ...option, probability, price, ev: price ? probability * price.odds - 1 : null };
  });
  const quoted = options.filter((option) => option.price && option.ev != null && option.ev >= 0).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));
  const chosen = quoted[0] ?? options[0];
  if (chosen.probability < (role === "VALUE" ? .16 : .42)) return null;
  const winnerName = winner === "HOME" ? row.homeName : row.awayName;
  const opposition = winner === "HOME" ? row.awayName : row.homeName;
  const score = winProbability * 55 + (edge ?? 0) * 180 + chosen.probability * 25 + (chosen.price ? 5 : 0);
  return {
    fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName,
    winner, winnerName, total: chosen.total, line: chosen.line, role, score, modelProbability: chosen.probability,
    marketWinnerProbability: marketProbability, winnerOdds: winPrice.odds, decimalOdds: chosen.price?.odds ?? null,
    bookmaker: chosen.price?.bookmaker ?? null,
    reason: role === "VALUE" ? `${winnerName} má proti trhu menší odstup, než naznačuje kurz na výhru.` : `${winnerName} je modelový favorit a gólová hranice odpovídá hlavnímu scénáři zápasu.`,
    risk: role === "VALUE" ? `${opposition} zůstává tržním favoritem; jde o nosnou, rizikovější nohu.` : "Kombinovaná podmínka může selhat i při správně odhadnutém vítězi.",
  };
}

export function rankIntuitionCandidates(rows: IntuitionSource[]) {
  return rows.flatMap((row) => [candidateFor(row, "HOME"), candidateFor(row, "AWAY")])
    .filter((item): item is IntuitionCandidate => item != null)
    .sort((a, b) => b.score - a.score);
}

export function buildIntuitionTickets(rows: IntuitionSource[], requestedDate: string): IntuitionTicket[] {
  const ranked = rankIntuitionCandidates(rows);
  const firstDay = ranked.filter((item) => localDateKey(item.kickoff) === requestedDate);
  const pool = firstDay.length >= 3 && firstDay.some((item) => item.role === "VALUE") ? firstDay : ranked;
  const unique = [...new Map(pool.map((item) => [item.fixtureId, item])).values()];
  const anchors = unique.filter((item) => item.role === "VALUE");
  if (!anchors.length || unique.length < 3) return [];
  const ticketCount = anchors.length >= 2 && unique.length >= 6 ? 2 : 1;
  const used = new Set<number>();
  const tickets: IntuitionTicket[] = [];
  for (let slot = 1; slot <= ticketCount; slot++) {
    const anchor = anchors.find((item) => !used.has(item.fixtureId));
    if (!anchor) break;
    const legs = [anchor]; used.add(anchor.fixtureId);
    for (const item of unique) {
      if (legs.length >= 3 || used.has(item.fixtureId) || item.role !== "SUPPORT") continue;
      legs.push(item); used.add(item.fixtureId);
    }
    if (legs.length < 3) break;
    tickets.push({ slot, dateKeys: [...new Set(legs.map((item) => localDateKey(item.kickoff)))], odds: null, legs });
  }
  for (const ticket of tickets) {
    const extra = unique.find((item) => item.role === "SUPPORT" && !used.has(item.fixtureId));
    if (extra) { ticket.legs.push(extra); used.add(extra.fixtureId); }
    ticket.dateKeys = [...new Set(ticket.legs.map((item) => localDateKey(item.kickoff)))];
    ticket.odds = ticket.legs.every((item) => item.decimalOdds != null) ? ticket.legs.reduce((value, item) => value * item.decimalOdds!, 1) : null;
  }
  return tickets;
}
