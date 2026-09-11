import { localDateKey } from "@/lib/competitionGrouping";
import { drawTau, poissonVector } from "@/lib/stats/predict";
import { bestLinePrice, bestPrice, bestResultTotalPrice, parseBooks, sharpFair, sharpLineFair } from "./books";

export const INTUITION_POLICY_VERSION = 5;

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
const ELO_MARKET_WEIGHT = .30;
const EXTREME_ELO_EDGE = .12;
export const ELO_SHADOW_ONLY_LEAGUE_IDS = new Set([40]); // English Championship

function pedigreeBonus(rating: number, sample: number) {
  if (sample < 30 || rating < 1500) return 0;
  const strength = Math.min(1, (rating - 1500) / 100);
  const history = Math.min(1, (sample - 30) / 70);
  return strength * 4 + history * 3;
}

export type IntuitionSource = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  homeWin: number; awayWin: number; lambdaHome: number; lambdaAway: number;
  lowConfidence: boolean; readinessSample: number; oddsBooks: unknown;
  homeGoals?: number | null; awayGoals?: number | null;
  elo?: {
    homeLongRating: number; awayLongRating: number; homeFastRating: number; awayFastRating: number;
    homeLongSample: number; awayLongSample: number; homeFastSample: number; awayFastSample: number;
    homeProbability: number; awayProbability: number; longHomeProb: number; longAwayProb: number; fastHomeProb: number; fastAwayProb: number;
  } | null;
};

export type IntuitionCandidate = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  winner: "HOME" | "AWAY"; winnerName: string; total: "OVER" | "UNDER"; line: number;
  role: "VALUE" | "SUPPORT" | "ELO"; score: number; modelProbability: number;
  eloLongProbability?: number | null; eloFastProbability?: number | null; eloWinnerProbability?: number | null; eloJointProbability?: number | null;
  eloLongHomeRating?: number | null; eloLongAwayRating?: number | null; eloFastHomeRating?: number | null; eloFastAwayRating?: number | null;
  eloLongSample?: number | null; eloFastSample?: number | null; modelExpectedValue?: number | null; eloExpectedValue?: number | null;
  marketWinnerProbability: number | null; winnerOdds: number | null;
  decimalOdds: number | null; bookmaker: string | null; priceKind: "DIRECT" | "SYNTHETIC" | "NONE"; reason: string; risk: string;
};

export type IntuitionTicket = { slot: number; dateKeys: string[]; odds: number | null; legs: IntuitionCandidate[] };
export type EloDivergence = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  winner: "HOME" | "AWAY"; winnerName: string; reason: "MARKET_AND_MODEL_OPPOSE_EXTREME_ELO" | "LEAGUE_SHADOW_ONLY";
  modelProbability: number; marketProbability: number; eloRawProbability: number; eloCalibratedProbability: number;
  longProbability: number; fastProbability: number; rawEdge: number;
};

export function scoreProbabilities(row: IntuitionSource, winner: "HOME" | "AWAY", total: "OVER" | "UNDER", line: number) {
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
  const fillers = unique.slice(0, 24);
  if (!anchors.length || fillers.length < 3) return [];
  const used = new Set<number>();
  const tickets: IntuitionTicket[] = [];

  for (let slot = 1; slot <= 2; slot++) {
    let best: { legs: IntuitionCandidate[]; odds: number; quality: number } | null = null;
    for (const anchor of anchors) {
      if (used.has(anchor.fixtureId)) continue;
      const available = fillers.filter((item) => item.fixtureId !== anchor.fixtureId && !used.has(item.fixtureId));
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

function evaluateElo(row: IntuitionSource, winner: "HOME" | "AWAY"): { candidate: IntuitionCandidate | null; divergence: EloDivergence | null } {
  const none = { candidate: null, divergence: null };
  const elo = row.elo;
  if (!elo) return none;
  const longSample = Math.min(elo.homeLongSample, elo.awayLongSample), fastSample = Math.min(elo.homeFastSample, elo.awayFastSample);
  if (longSample < 10 || fastSample < 5) return none;
  const books = parseBooks(row.oddsBooks), side = winner === "HOME" ? "home" : "away", opposite = winner === "HOME" ? "away" : "home";
  const fair = sharpFair(books), market = fair?.[side] ?? null;
  const longProbability = winner === "HOME" ? elo.longHomeProb : elo.longAwayProb;
  const fastProbability = winner === "HOME" ? elo.fastHomeProb : elo.fastAwayProb;
  const blended = winner === "HOME" ? elo.homeProbability : elo.awayProbability;
  if (market == null || !((longProbability >= market && fastProbability >= market && blended - market >= .03) || (longProbability - market >= .06 && fastProbability - market >= -.02))) return none;
  const winPrice = bestPrice(books, side);
  if (!winPrice) return none;
  const modelWin = winner === "HOME" ? row.homeWin : row.awayWin;
  const modelOpposite = winner === "HOME" ? row.awayWin : row.homeWin;
  const rawEdge = blended - market;
  const calibrated = blended * (1 - ELO_MARKET_WEIGHT) + market * ELO_MARKET_WEIGHT;
  if (ELO_SHADOW_ONLY_LEAGUE_IDS.has(row.leagueId)) {
    return { candidate: null, divergence: { fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName, winner, winnerName: winner === "HOME" ? row.homeName : row.awayName, reason: "LEAGUE_SHADOW_ONLY", modelProbability: modelWin, marketProbability: market, eloRawProbability: blended, eloCalibratedProbability: calibrated, longProbability, fastProbability, rawEdge } };
  }
  const marketOpposes = fair?.[opposite] != null && market < fair[opposite]!;
  if (marketOpposes && modelWin < modelOpposite && (rawEdge > EXTREME_ELO_EDGE || modelWin < market - .05)) {
    return { candidate: null, divergence: { fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName, winner, winnerName: winner === "HOME" ? row.homeName : row.awayName, reason: "MARKET_AND_MODEL_OPPOSE_EXTREME_ELO", modelProbability: modelWin, marketProbability: market, eloRawProbability: blended, eloCalibratedProbability: calibrated, longProbability, fastProbability, rawEdge } };
  }
  const options = ([{ total: "OVER", line: 1.5 }, { total: "UNDER", line: 4.5 }, { total: "UNDER", line: 5.5 }] as const).flatMap((option) => {
    const direct = bestResultTotalPrice(books, side, option.total.toLowerCase() as "over" | "under", option.line);
    if (!direct || direct.odds < 1.6 || direct.odds > 6) return [];
    const model = scoreProbabilities(row, winner, option.total, option.line);
    if (model.win <= 0) return [];
    const eloJoint = calibrated * model.joint / model.win;
    return [{ ...option, direct, modelJoint: model.joint, eloJoint, eloEv: eloJoint * direct.odds - 1, modelEv: model.joint * direct.odds - 1 }];
  }).sort((a, b) => b.eloEv - a.eloEv);
  const chosen = options[0];
  if (!chosen) return none;
  const winnerName = winner === "HOME" ? row.homeName : row.awayName;
  const winnerLongRating = winner === "HOME" ? elo.homeLongRating : elo.awayLongRating;
  const pedigree = pedigreeBonus(winnerLongRating, longSample);
  const established = winnerLongRating >= 1550 && longSample >= 40;
  return { divergence: null, candidate: {
    fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName,
    winner, winnerName, total: chosen.total, line: chosen.line, role: "ELO", score: chosen.eloEv * 80 + calibrated * 50 + Math.min(longSample, 30) / 3 + pedigree,
    modelProbability: chosen.modelJoint, marketWinnerProbability: market, winnerOdds: winPrice.odds, decimalOdds: chosen.direct.odds, bookmaker: chosen.direct.bookmaker, priceKind: "DIRECT",
    eloLongProbability: longProbability, eloFastProbability: fastProbability, eloWinnerProbability: calibrated, eloJointProbability: chosen.eloJoint,
    eloLongHomeRating: elo.homeLongRating, eloLongAwayRating: elo.awayLongRating, eloFastHomeRating: elo.homeFastRating, eloFastAwayRating: elo.awayFastRating,
    eloLongSample: longSample, eloFastSample: fastSample, modelExpectedValue: chosen.modelEv, eloExpectedValue: chosen.eloEv,
    reason: `LONG a FAST Elo podporují ${winnerName}; po kalibraci směrem k trhu je edge ${Math.round((calibrated - market) * 100)} p. b.${established ? " Dlouhodobý rating a vzorek navíc potvrzují zavedený výkonnostní standard klubu." : ""}`,
    risk: chosen.modelEv < 0 ? "Hlavní gólový model má záporné EV; v experimentu je to viditelný rozpor, nikoli filtr." : "Elo měří výsledkovou sílu, nikoli sestavy ani aktuální kontext.",
  } };
}

export function rankEloCandidates(rows: IntuitionSource[]) {
  return rows.flatMap((row) => [evaluateElo(row, "HOME").candidate, evaluateElo(row, "AWAY").candidate]).filter((x): x is IntuitionCandidate => x != null).sort((a, b) => b.score - a.score);
}

export function rankEloDivergences(rows: IntuitionSource[]) {
  return rows.flatMap((row) => [evaluateElo(row, "HOME").divergence, evaluateElo(row, "AWAY").divergence]).filter((x): x is EloDivergence => x != null).sort((a, b) => b.rawEdge - a.rawEdge);
}

function assembleEloTickets(pool: IntuitionCandidate[]) {
  const unique = [...new Map(pool.map((item) => [item.fixtureId, item])).values()].slice(0, 28);
  const used = new Set<number>(), tickets: IntuitionTicket[] = [];
  for (let slot = 1; slot <= 2; slot++) {
    let best: { legs: IntuitionCandidate[]; odds: number; quality: number } | null = null;
    const available = unique.filter((x) => !used.has(x.fixtureId));
    const visit = (start: number, legs: IntuitionCandidate[]) => {
      if (legs.length >= 3) {
        const odds = legs.reduce((v, x) => v * x.decimalOdds!, 1);
        if (odds >= TICKET_MIN_ODDS && odds <= TICKET_MAX_ODDS) {
          const quality = legs.reduce((v, x) => v + x.score, 0) - Math.abs(Math.log(odds / 12)) * 4;
          if (!best || quality > best.quality) best = { legs: [...legs], odds, quality };
        }
      }
      if (legs.length === 4) return;
      for (let i = start; i < available.length; i++) visit(i + 1, [...legs, available[i]]);
    };
    visit(0, []);
    if (!best) break;
    const selected = best as { legs: IntuitionCandidate[]; odds: number; quality: number };
    selected.legs.forEach((leg) => used.add(leg.fixtureId));
    tickets.push({ slot, dateKeys: [...new Set(selected.legs.map((x) => localDateKey(x.kickoff)))], odds: selected.odds, legs: selected.legs });
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

export function buildEloIntuitionTickets(rows: IntuitionSource[], requestedDate: string): IntuitionTicket[] {
  const ranked = rankEloCandidates(rows);
  const sameDay = assembleEloTickets(ranked.filter((item) => localDateKey(item.kickoff) === requestedDate));
  if (sameDay.length >= 2) return sameDay;
  const extended = assembleEloTickets(ranked);
  return extended.length > sameDay.length ? extended : sameDay;
}
