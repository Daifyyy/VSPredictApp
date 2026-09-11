import "server-only";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/competitionGrouping";
import { pragueDateBounds } from "@/lib/recentWindow";
import { buildEloIntuitionTickets, buildIntuitionTickets, INTUITION_POLICY_VERSION, rankEloCandidates, rankIntuitionCandidates, type IntuitionSource, type IntuitionTicket } from "@/lib/picks/intuitionTickets";
import { CLUB_ELO_MODEL_VERSION } from "@/lib/picks/clubElo";
import { FIXTURE_LIST_LEAGUE_IDS } from "./catalog";

const LOCK_MINUTES = 120;

async function sources(windowKey: string): Promise<IntuitionSource[]> {
  const start = pragueDateBounds(windowKey).start;
  const end = new Date(start.getTime() + 48 * 60 * 60_000);
  const rows = await prisma.fixturePrediction.findMany({
    where: {
      available: true, kickoff: { gte: start, lt: end }, leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] },
      status: { notIn: ["PST", "CANC", "ABD"] },
    },
    orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }],
    select: { fixtureId: true, leagueId: true, kickoff: true, homeName: true, awayName: true, homeWin: true, awayWin: true, lambdaHome: true, lambdaAway: true, lowConfidence: true, readinessSample: true, oddsBooks: true, oddsCurrentBooks: true, homeGoals: true, awayGoals: true },
  });
  const eloRows = await prisma.clubEloFixtureSnapshot.findMany({ where: { modelVersion: CLUB_ELO_MODEL_VERSION, fixtureId: { in: rows.map((row) => row.fixtureId) } } });
  const elo = new Map(eloRows.map((row) => [row.fixtureId, row]));
  return rows.map(({ oddsCurrentBooks, ...row }) => ({
    ...row,
    oddsBooks: oddsCurrentBooks ?? row.oddsBooks,
    elo: elo.get(row.fixtureId) ?? null,
  }));
}

export type TicketEmptyReason = "WAITING_FOR_ODDS" | "INSUFFICIENT_ELO_HISTORY" | "NOT_ENOUGH_CANDIDATES" | "NO_VALID_COMBINATION";

function emptyReason(strategy: "VALUE" | "ELO_INTUITION", rows: IntuitionSource[], tickets: IntuitionTicket[]): TicketEmptyReason | null {
  if (tickets.length) return null;
  const withOdds = rows.filter((row) => Array.isArray(row.oddsBooks) && row.oddsBooks.length > 0);
  if (withOdds.length < 3) return "WAITING_FOR_ODDS";
  if (strategy === "ELO_INTUITION" && rows.filter((row) => row.elo && Math.min(row.elo.homeLongSample, row.elo.awayLongSample) >= 10 && Math.min(row.elo.homeFastSample, row.elo.awayFastSample) >= 5).length < 3) return "INSUFFICIENT_ELO_HISTORY";
  const candidates = strategy === "VALUE" ? rankIntuitionCandidates(rows) : rankEloCandidates(rows);
  return candidates.length < 3 ? "NOT_ENOUGH_CANDIDATES" : "NO_VALID_COMBINATION";
}

function draft(strategy: string, tickets: IntuitionTicket[], now: Date) {
  return tickets.map((ticket) => ({
    strategy, slot: ticket.slot, status: "DRAFT", combinedOdds: ticket.odds, priceKind: ticket.legs.every((leg) => leg.priceKind === "DIRECT") ? "DIRECT" : ticket.odds == null ? "NONE" : "SYNTHETIC", generatedAt: now, lockedAt: null, hit: null, profit: null, settledAt: null,
    legs: ticket.legs.map((leg) => ({ ...leg, totalSide: leg.total, totalLine: leg.line, hit: null, homeGoals: null, awayGoals: null, settledAt: null })),
  }));
}

export async function previewIntuitionTickets(windowKey: string, now = new Date()) {
  const frozen = await prisma.intuitionTicket.findMany({
    where: { windowKey, policyVersion: INTUITION_POLICY_VERSION }, orderBy: [{ strategy: "asc" }, { slot: "asc" }], include: { legs: { orderBy: { kickoff: "asc" } } },
  });
  const rows = await sources(windowKey);
  return { strategies: (["VALUE", "ELO_INTUITION"] as const).map((strategy) => {
    const persisted = frozen.filter((ticket) => ticket.strategy === strategy);
    const built = persisted.length ? [] : strategy === "VALUE" ? buildIntuitionTickets(rows, windowKey) : buildEloIntuitionTickets(rows, windowKey);
    const tickets = persisted.length ? persisted : draft(strategy, built, now);
    return { strategy, frozen: persisted.length > 0, tickets, emptyReason: persisted.length ? null : emptyReason(strategy, rows, built), coverage: { fixtures: rows.length, withOdds: rows.filter((r) => Array.isArray(r.oddsBooks) && r.oddsBooks.length > 0).length, candidates: strategy === "VALUE" ? rankIntuitionCandidates(rows).length : rankEloCandidates(rows).length } };
  }) };
}

/** Volá kurzový cron. Draft se nemění v historický záznam dříve než dvě hodiny před první nohou. */
export async function captureIntuitionTickets(fixtureId: number, at: Date): Promise<number> {
  const trigger = await prisma.fixturePrediction.findUnique({ where: { fixtureId }, select: { kickoff: true } });
  if (!trigger || trigger.kickoff <= at) return 0;
  const windowKey = localDateKey(trigger.kickoff);
  const rows = await sources(windowKey);
  let saved = 0;
  for (const strategy of ["VALUE", "ELO_INTUITION"] as const) {
    if (await prisma.intuitionTicket.count({ where: { windowKey, strategy, policyVersion: INTUITION_POLICY_VERSION } })) continue;
    const tickets = strategy === "VALUE" ? buildIntuitionTickets(rows, windowKey) : buildEloIntuitionTickets(rows, windowKey);
    if (!tickets.length) continue;
    const firstKickoff = Math.min(...tickets.flatMap((ticket) => ticket.legs.map((leg) => leg.kickoff.getTime())));
    if (firstKickoff - at.getTime() > LOCK_MINUTES * 60_000) continue;
    await prisma.$transaction(tickets.map((ticket) => prisma.intuitionTicket.create({ data: {
    windowKey, strategy, slot: ticket.slot, policyVersion: INTUITION_POLICY_VERSION, status: "LOCKED", combinedOdds: ticket.odds, priceKind: ticket.legs.every((leg) => leg.priceKind === "DIRECT") ? "DIRECT" : ticket.odds == null ? "NONE" : "SYNTHETIC",
    generatedAt: at, lockedAt: at,
    legs: { create: ticket.legs.map((leg) => ({
      fixtureId: leg.fixtureId, leagueId: leg.leagueId, kickoff: leg.kickoff, homeName: leg.homeName, awayName: leg.awayName,
      winner: leg.winner, winnerName: leg.winnerName, totalSide: leg.total, totalLine: leg.line, role: leg.role,
      score: leg.score, modelProbability: leg.modelProbability, marketWinnerProbability: leg.marketWinnerProbability,
      eloLongProbability: leg.eloLongProbability, eloFastProbability: leg.eloFastProbability, eloWinnerProbability: leg.eloWinnerProbability, eloJointProbability: leg.eloJointProbability,
      eloLongHomeRating: leg.eloLongHomeRating, eloLongAwayRating: leg.eloLongAwayRating, eloFastHomeRating: leg.eloFastHomeRating, eloFastAwayRating: leg.eloFastAwayRating,
      eloLongSample: leg.eloLongSample, eloFastSample: leg.eloFastSample, modelExpectedValue: leg.modelExpectedValue ?? (leg.decimalOdds ? leg.modelProbability * leg.decimalOdds - 1 : null), eloExpectedValue: leg.eloExpectedValue,
      winnerOdds: leg.winnerOdds, decimalOdds: leg.decimalOdds, bookmaker: leg.bookmaker, priceKind: leg.priceKind, reason: leg.reason, risk: leg.risk,
    })) },
    } })));
    saved += tickets.length;
  }
  return saved;
}

export async function settleIntuitionTickets(fixtureId: number, homeGoals: number | null, awayGoals: number | null, at: Date) {
  if (homeGoals == null || awayGoals == null) return 0;
  const legs = await prisma.intuitionTicketLeg.findMany({ where: { fixtureId, settledAt: null }, select: { id: true, ticketId: true, winner: true, totalSide: true, totalLine: true } });
  for (const leg of legs) {
    const winnerHit = leg.winner === "HOME" ? homeGoals > awayGoals : awayGoals > homeGoals;
    const total = homeGoals + awayGoals;
    const totalHit = leg.totalSide === "OVER" ? total > leg.totalLine : total < leg.totalLine;
    await prisma.intuitionTicketLeg.update({ where: { id: leg.id }, data: { homeGoals, awayGoals, hit: winnerHit && totalHit, settledAt: at } });
  }
  for (const ticketId of new Set(legs.map((leg) => leg.ticketId))) {
    const ticket = await prisma.intuitionTicket.findUnique({ where: { id: ticketId }, include: { legs: true } });
    if (!ticket || ticket.legs.some((leg) => leg.hit == null)) continue;
    const hit = ticket.legs.every((leg) => leg.hit);
    await prisma.intuitionTicket.update({ where: { id: ticketId }, data: { status: "SETTLED", hit, profit: ticket.combinedOdds == null ? null : hit ? ticket.combinedOdds - 1 : -1, settledAt: at } });
  }
  return legs.length;
}
