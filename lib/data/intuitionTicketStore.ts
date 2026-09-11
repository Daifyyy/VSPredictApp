import "server-only";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/competitionGrouping";
import { pragueDateBounds } from "@/lib/recentWindow";
import { buildIntuitionTickets, INTUITION_POLICY_VERSION, type IntuitionSource } from "@/lib/picks/intuitionTickets";
import { FIXTURE_LIST_LEAGUE_IDS } from "./catalog";

const LOCK_MINUTES = 120;

async function sources(windowKey: string, now: Date): Promise<IntuitionSource[]> {
  const start = pragueDateBounds(windowKey).start;
  const end = new Date(start.getTime() + 48 * 60 * 60_000);
  const reserved = await prisma.intuitionTicketLeg.findMany({
    where: { ticket: { status: "LOCKED", policyVersion: INTUITION_POLICY_VERSION }, kickoff: { gt: now } },
    select: { fixtureId: true },
  });
  const reservedIds = reserved.map((item) => item.fixtureId);
  return prisma.fixturePrediction.findMany({
    where: {
      available: true, kickoff: { gte: start, lt: end }, leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] },
      status: { notIn: ["PST", "CANC", "ABD"] }, ...(reservedIds.length ? { fixtureId: { notIn: reservedIds } } : {}),
    },
    orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }],
    select: { fixtureId: true, leagueId: true, kickoff: true, homeName: true, awayName: true, homeWin: true, awayWin: true, lambdaHome: true, lambdaAway: true, lowConfidence: true, readinessSample: true, oddsBooks: true, homeGoals: true, awayGoals: true },
  });
}

export async function previewIntuitionTickets(windowKey: string, now = new Date()) {
  const frozen = await prisma.intuitionTicket.findMany({
    where: { windowKey, policyVersion: INTUITION_POLICY_VERSION }, orderBy: { slot: "asc" }, include: { legs: { orderBy: { kickoff: "asc" } } },
  });
  if (frozen.length) return { frozen: true, tickets: frozen };
  const tickets = buildIntuitionTickets(await sources(windowKey, now), windowKey);
  return { frozen: false, tickets: tickets.map((ticket) => ({
    slot: ticket.slot, status: "DRAFT", combinedOdds: ticket.odds, generatedAt: now, lockedAt: null, hit: null, profit: null, settledAt: null,
    legs: ticket.legs.map((leg) => ({ ...leg, totalSide: leg.total, totalLine: leg.line, hit: null, homeGoals: null, awayGoals: null, settledAt: null })),
  })) };
}

/** Volá kurzový cron. Draft se nemění v historický záznam dříve než dvě hodiny před první nohou. */
export async function captureIntuitionTickets(fixtureId: number, at: Date): Promise<number> {
  const trigger = await prisma.fixturePrediction.findUnique({ where: { fixtureId }, select: { kickoff: true } });
  if (!trigger || trigger.kickoff <= at) return 0;
  const windowKey = localDateKey(trigger.kickoff);
  if (await prisma.intuitionTicket.count({ where: { windowKey, policyVersion: INTUITION_POLICY_VERSION } })) return 0;
  const tickets = buildIntuitionTickets(await sources(windowKey, at), windowKey);
  if (!tickets.length) return 0;
  const firstKickoff = Math.min(...tickets.flatMap((ticket) => ticket.legs.map((leg) => leg.kickoff.getTime())));
  if (firstKickoff - at.getTime() > LOCK_MINUTES * 60_000) return 0;
  await prisma.$transaction(tickets.map((ticket) => prisma.intuitionTicket.create({ data: {
    windowKey, slot: ticket.slot, policyVersion: INTUITION_POLICY_VERSION, status: "LOCKED", combinedOdds: ticket.odds,
    generatedAt: at, lockedAt: at,
    legs: { create: ticket.legs.map((leg) => ({
      fixtureId: leg.fixtureId, leagueId: leg.leagueId, kickoff: leg.kickoff, homeName: leg.homeName, awayName: leg.awayName,
      winner: leg.winner, winnerName: leg.winnerName, totalSide: leg.total, totalLine: leg.line, role: leg.role,
      score: leg.score, modelProbability: leg.modelProbability, marketWinnerProbability: leg.marketWinnerProbability,
      winnerOdds: leg.winnerOdds, decimalOdds: leg.decimalOdds, bookmaker: leg.bookmaker, reason: leg.reason, risk: leg.risk,
    })) },
  } })));
  return tickets.length;
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
