import { localDateKey } from "@/lib/competitionGrouping";
import { drawTau, poissonVector } from "@/lib/stats/predict";
import { bestLinePrice, bestPrice, bestResultTotalPrice, parseBooks, sharpFair, sharpLineFair } from "./books";

export const INTUITION_POLICY_VERSION = 6;

const MIN_READINESS_SAMPLE = 6;
const MIN_DIRECT_ODDS = 1.6;
const MIN_SYNTHETIC_ODDS = 1.7;
const MAX_LEG_ODDS = 6;
const VALUE_MIN_EV = .08;
const SYNTHETIC_VALUE_MIN_EV = .12;
const ELO_MARKET_WEIGHT = .30;
const EXTREME_ELO_EDGE = .12;
export const ELO_SHADOW_ONLY_LEAGUE_IDS = new Set([40]); // English Championship

export type PedigreeSignal = { id?: string; score: number; eloPercentile: number; continuity: number; europeanExperience: number; seasons: number; leagueMatches: number; europeanMatches: number; established: boolean };
export type TeamContextSignal = { formPpg: number | null; seasonPpg: number | null; standingRank: number | null; standingSize: number | null; restDays: number | null; importantAbsences: number | null; strengthLoss: number | null; missingGoalkeeper: boolean | null; missingKeyScorer: boolean | null; coachChangedRecently: boolean | null; lineupAvailable: boolean };

export type IntuitionSource = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  homeWin: number; awayWin: number; lambdaHome: number; lambdaAway: number;
  lowConfidence: boolean; readinessSample: number; oddsBooks: unknown;
  homeTeamId?: number; awayTeamId?: number;
  pedigree?: { home: PedigreeSignal; away: PedigreeSignal } | null;
  context?: { home: TeamContextSignal; away: TeamContextSignal } | null;
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
  role: "VALUE" | "ELO"; score: number; modelProbability: number;
  eloLongProbability?: number | null; eloFastProbability?: number | null; eloWinnerProbability?: number | null; eloJointProbability?: number | null;
  eloLongHomeRating?: number | null; eloLongAwayRating?: number | null; eloFastHomeRating?: number | null; eloFastAwayRating?: number | null;
  eloLongSample?: number | null; eloFastSample?: number | null; modelExpectedValue?: number | null; eloExpectedValue?: number | null;
  marketWinnerProbability: number | null; winnerOdds: number | null;
  decimalOdds: number | null; bookmaker: string | null; priceKind: "DIRECT" | "SYNTHETIC" | "NONE"; reason: string; risk: string;
  pedigreeScore?: number | null; contextScore?: number | null; contextSupports?: string[]; contextVetoes?: string[];
  pedigreeSnapshotId?: string | null;
};

export type IntuitionTicket = { slot: number; dateKeys: string[]; odds: number | null; legs: IntuitionCandidate[] };
export type EloDivergence = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  winner: "HOME" | "AWAY"; winnerName: string; reason: "MARKET_AND_MODEL_OPPOSE_EXTREME_ELO" | "LEAGUE_SHADOW_ONLY" | "CONTEXT_VETO";
  modelProbability: number; marketProbability: number; eloRawProbability: number; eloCalibratedProbability: number;
  longProbability: number; fastProbability: number; rawEdge: number;
  details?: string[];
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
  const winPrice = bestPrice(books, side);
  if (!winPrice) return null;
  const fair = sharpFair(books);
  const marketProbability = fair?.[side] ?? null;
  const options = ([{ total: "OVER", line: 1.5 }, { total: "UNDER", line: 4.5 }, { total: "UNDER", line: 5.5 }] as const).map((option) => {
    const probability = scoreProbabilities(row, winner, option.total, option.line).joint;
    const direct = bestResultTotalPrice(books, side, option.total.toLowerCase() as "over" | "under", option.line);
    const synthetic = direct ? null : syntheticPrice(row, books, winner, option.total, option.line);
    const price = direct ?? synthetic;
    return { ...option, probability, price, priceKind: direct ? "DIRECT" as const : synthetic ? "SYNTHETIC" as const : "NONE" as const, ev: price ? probability * price.odds - 1 : null };
  });
  const eligible = options.flatMap((option) => {
    if (!option.price || option.ev == null) return [];
    const minOdds = option.priceKind === "DIRECT" ? MIN_DIRECT_ODDS : MIN_SYNTHETIC_ODDS;
    const minEv = option.priceKind === "DIRECT" ? VALUE_MIN_EV : SYNTHETIC_VALUE_MIN_EV;
    if (option.price.odds < minOdds || option.price.odds > MAX_LEG_ODDS || option.ev < minEv) return [];
    return [{ ...option, role: "VALUE" as const }];
  }).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));
  const chosen = eligible[0];
  if (!chosen) return null;
  const winnerName = winner === "HOME" ? row.homeName : row.awayName;
  const score = chosen.probability * 60 + Math.min(chosen.ev ?? 0, .30) * 80 + (chosen.priceKind === "DIRECT" ? 5 : 0);
  return {
    fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName,
    winner, winnerName, total: chosen.total, line: chosen.line, role: "VALUE", score, modelProbability: chosen.probability,
    marketWinnerProbability: marketProbability, winnerOdds: winPrice.odds, decimalOdds: chosen.price?.odds ?? null,
    bookmaker: chosen.price?.bookmaker ?? null, priceKind: chosen.priceKind,
    modelExpectedValue: chosen.ev,
    reason: `${winnerName} + gólová hranice mají jako celek modelové EV ${Math.round((chosen.ev ?? 0) * 100)} %.`,
    risk: chosen.priceKind === "SYNTHETIC" ? "Kombinovaný kurz je odhad ze samostatných trhů, nikoli doložená nabídka." : "Kombinovaná podmínka může selhat i při správně odhadnutém vítězi.",
  };
}

export function rankIntuitionCandidates(rows: IntuitionSource[]) {
  return rows.flatMap((row) => [candidateFor(row, "HOME"), candidateFor(row, "AWAY")])
    .filter((item): item is IntuitionCandidate => item != null)
    .sort((a, b) => b.score - a.score);
}

function contextualAssessment(row: IntuitionSource, winner: "HOME" | "AWAY", market: number, rawEdge: number) {
  const selectedPedigree = winner === "HOME" ? row.pedigree?.home : row.pedigree?.away;
  const opponentPedigree = winner === "HOME" ? row.pedigree?.away : row.pedigree?.home;
  const selected = winner === "HOME" ? row.context?.home : row.context?.away;
  const opponent = winner === "HOME" ? row.context?.away : row.context?.home;
  const supports: string[] = [], vetoes: string[] = [];
  let score = 0;
  if (selectedPedigree?.established) { score += 2; supports.push("zavedený výkonnostní standard"); }
  else if (rawEdge >= .06 && market >= .40) { score += 1; supports.push("jednoznačná Elo hierarchie"); }
  else vetoes.push("chybí pedigree nebo jednoznačná hierarchie");
  const formGap = selected?.formPpg != null && opponent?.formPpg != null ? selected.formPpg - opponent.formPpg : null;
  const seasonGap = selected?.seasonPpg != null && opponent?.seasonPpg != null ? selected.seasonPpg - opponent.seasonPpg : null;
  if (formGap != null) { if (formGap >= .4) { score += 2; supports.push("lepší aktuální forma"); } else if (formGap <= -.6) score -= 2; }
  if (seasonGap != null) { if (seasonGap >= .3) { score += 1; supports.push("lepší sezonní výkonnost"); } else if (seasonGap <= -.4) score -= 1; }
  if (selected?.standingRank != null && opponent?.standingRank != null && selected.standingRank + 4 <= opponent.standingRank) { score += 1; supports.push("lepší postavení v tabulce"); }
  if (formGap != null && seasonGap != null && formGap <= -.6 && seasonGap <= -.4) vetoes.push("výrazně horší forma i sezonní výkonnost");
  const restGap = selected?.restDays != null && opponent?.restDays != null ? selected.restDays - opponent.restDays : null;
  if (restGap != null) { if (restGap >= 2) { score += 1; supports.push("výhoda odpočinku"); } else if (restGap <= -3) score -= 1; }
  if (restGap != null && restGap <= -3 && formGap != null && formGap < 0) vetoes.push("nevýhoda odpočinku společně s horší formou");
  if (winner === "HOME") { score += 1; supports.push("domácí prostředí"); }
  const absenceGap = selected?.importantAbsences != null && opponent?.importantAbsences != null ? selected.importantAbsences - opponent.importantAbsences : null;
  if ((absenceGap != null && absenceGap >= 3) || (selected?.missingGoalkeeper === true && selected.strengthLoss != null && selected.strengthLoss >= .15)) vetoes.push("zásadně horší dostupnost obvyklých hráčů");
  if (selected?.missingKeyScorer) score -= 1;
  if (selected?.coachChangedRecently) score -= 1;
  if (selected?.lineupAvailable && !selected.missingGoalkeeper && !selected.missingKeyScorer) { score += 1; supports.push("bez zásadního problému v dostupné sestavě"); }
  if (selectedPedigree?.established && opponentPedigree?.established && row.context && Math.abs((row.homeWin ?? 0) - (row.awayWin ?? 0)) <= .08 && score <= 0) vetoes.push("vyrovnaný duel dvou silných značek bez kontextové převahy");
  return { score, supports, vetoes, pedigree: selectedPedigree?.score ?? 0 };
}

function assembleTickets(pool: IntuitionCandidate[]): IntuitionTicket[] {
  const unique = [...new Map(pool.map((item) => [item.fixtureId, item])).values()];
  const tickets: IntuitionTicket[] = [];
  for (let slot = 1; slot <= 2; slot++) {
    const offset = tickets.reduce((sum, ticket) => sum + ticket.legs.length, 0);
    const available = unique.slice(offset);
    if (available.length < 3) break;
    const legs = available.slice(0, 3);
    const fourth = available[3];
    if (fourth && (slot === 2 || available.length >= 7) && fourth.score >= legs[2].score * .90) legs.push(fourth);
    const odds = legs.reduce((value, leg) => value * leg.decimalOdds!, 1);
    tickets.push({ slot, dateKeys: [...new Set(legs.map((item) => localDateKey(item.kickoff)))], odds, legs });
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
  const context = contextualAssessment(row, winner, market, rawEdge);
  if (context.vetoes.length) {
    return { candidate: null, divergence: { fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName, winner, winnerName: winner === "HOME" ? row.homeName : row.awayName, reason: "CONTEXT_VETO", details: context.vetoes, modelProbability: modelWin, marketProbability: market, eloRawProbability: blended, eloCalibratedProbability: calibrated, longProbability, fastProbability, rawEdge } };
  }
  const options = ([{ total: "OVER", line: 1.5 }, { total: "UNDER", line: 4.5 }, { total: "UNDER", line: 5.5 }] as const).flatMap((option) => {
    const direct = bestResultTotalPrice(books, side, option.total.toLowerCase() as "over" | "under", option.line);
    if (!direct || direct.odds < 1.6 || direct.odds > 6) return [];
    const model = scoreProbabilities(row, winner, option.total, option.line);
    if (model.win <= 0) return [];
    const eloJoint = calibrated * model.joint / model.win;
    return [{ ...option, direct, modelJoint: model.joint, eloJoint, eloEv: eloJoint * direct.odds - 1, modelEv: model.joint * direct.odds - 1 }];
  }).sort((a, b) => b.eloJoint - a.eloJoint);
  const chosen = options[0];
  if (!chosen) return none;
  const winnerName = winner === "HOME" ? row.homeName : row.awayName;
  return { divergence: null, candidate: {
    fixtureId: row.fixtureId, leagueId: row.leagueId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName,
    winner, winnerName, total: chosen.total, line: chosen.line, role: "ELO", score: chosen.eloJoint * 100 + rawEdge * 40 + context.score * 4 + context.pedigree * 8,
    modelProbability: chosen.modelJoint, marketWinnerProbability: market, winnerOdds: winPrice.odds, decimalOdds: chosen.direct.odds, bookmaker: chosen.direct.bookmaker, priceKind: "DIRECT",
    eloLongProbability: longProbability, eloFastProbability: fastProbability, eloWinnerProbability: calibrated, eloJointProbability: chosen.eloJoint,
    eloLongHomeRating: elo.homeLongRating, eloLongAwayRating: elo.awayLongRating, eloFastHomeRating: elo.homeFastRating, eloFastAwayRating: elo.awayFastRating,
    eloLongSample: longSample, eloFastSample: fastSample, modelExpectedValue: chosen.modelEv, eloExpectedValue: chosen.eloEv,
    pedigreeScore: context.pedigree, pedigreeSnapshotId: (winner === "HOME" ? row.pedigree?.home.id : row.pedigree?.away.id) ?? null, contextScore: context.score, contextSupports: context.supports, contextVetoes: [],
    reason: `LONG a FAST Elo podporují ${winnerName}; edge je ${Math.round((calibrated - market) * 100)} p. b.${context.supports.length ? ` Kontext: ${context.supports.join(", ")}.` : ""}`,
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
  const unique = [...new Map(pool.map((item) => [item.fixtureId, item])).values()];
  const tickets: IntuitionTicket[] = [];
  for (let slot = 1; slot <= 2; slot++) {
    const offset = tickets.reduce((sum, ticket) => sum + ticket.legs.length, 0);
    const available = unique.slice(offset);
    if (available.length < 3) break;
    const legs = available.slice(0, 3);
    const fourth = available[3];
    if (fourth && (slot === 2 || available.length >= 7) && (fourth.pedigreeScore ?? 0) >= .60 && (fourth.contextScore ?? 0) > 0 && fourth.score >= legs[2].score * .90) legs.push(fourth);
    const odds = legs.reduce((value, leg) => value * leg.decimalOdds!, 1);
    tickets.push({ slot, dateKeys: [...new Set(legs.map((x) => localDateKey(x.kickoff)))], odds, legs });
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
