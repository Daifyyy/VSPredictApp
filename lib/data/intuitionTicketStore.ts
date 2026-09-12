import "server-only";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/competitionGrouping";
import { pragueDateBounds } from "@/lib/recentWindow";
import { buildEloIntuitionTickets, buildIntuitionTickets, INTUITION_POLICY_VERSION, rankEloCandidates, rankEloDivergences, rankIntuitionCandidates, type IntuitionSource, type IntuitionTicket } from "@/lib/picks/intuitionTickets";
import { CLUB_ELO_MODEL_VERSION } from "@/lib/picks/clubElo";
import { buildPedigree } from "@/lib/picks/clubPedigree";
import { computeSeason } from "./catalog";
import { FIXTURE_LIST_LEAGUE_IDS } from "./catalog";

const LOCK_MINUTES = 120;

function points(row: { homeTeamId: number; awayTeamId: number; homeGoals: number | null; awayGoals: number | null }, teamId: number) {
  if (row.homeGoals == null || row.awayGoals == null) return 0;
  const home = row.homeTeamId === teamId;
  const own = home ? row.homeGoals : row.awayGoals, other = home ? row.awayGoals : row.homeGoals;
  return own > other ? 3 : own === other ? 1 : 0;
}

async function pedigreeSnapshots(teamIds: number[], asOfDate: Date, calculatedAt: Date, persist: boolean) {
  const [states, matches] = await Promise.all([
    prisma.clubEloState.findMany({ where: { modelVersion: CLUB_ELO_MODEL_VERSION, teamId: { in: teamIds } } }),
    prisma.clubEloMatch.findMany({ where: { kickoff: { lt: asOfDate }, OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] }, select: { season: true, context: true, homeTeamId: true, awayTeamId: true } }),
  ]);
  const leagueIds = [...new Set(states.map((state) => state.leagueId))];
  const peers = await prisma.clubEloState.findMany({ where: { modelVersion: CLUB_ELO_MODEL_VERSION, leagueId: { in: leagueIds } } });
  const profiles = buildPedigree(peers, matches, computeSeason(asOfDate)).filter((profile) => teamIds.includes(profile.teamId));
  if (!persist) return profiles;
  await prisma.clubPedigreeSnapshot.createMany({ data: profiles.map((profile) => ({ ...profile, asOfDate, modelVersion: CLUB_ELO_MODEL_VERSION, calculatedAt })), skipDuplicates: true });
  return prisma.clubPedigreeSnapshot.findMany({ where: { teamId: { in: teamIds }, asOfDate, modelVersion: CLUB_ELO_MODEL_VERSION } });
}

async function sources(windowKey: string, persistPedigree = false): Promise<IntuitionSource[]> {
  const start = pragueDateBounds(windowKey).start;
  const end = new Date(start.getTime() + 48 * 60 * 60_000);
  const rows = await prisma.fixturePrediction.findMany({
    where: {
      available: true, kickoff: { gte: start, lt: end }, leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] },
      status: { notIn: ["PST", "CANC", "ABD"] },
    },
    orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }],
    select: { fixtureId: true, leagueId: true, kickoff: true, homeTeamId: true, awayTeamId: true, homeName: true, awayName: true, homeWin: true, awayWin: true, lambdaHome: true, lambdaAway: true, lowConfidence: true, readinessSample: true, oddsBooks: true, oddsCurrentBooks: true, homeGoals: true, awayGoals: true },
  });
  const teamIds = [...new Set(rows.flatMap((row) => [row.homeTeamId, row.awayTeamId]))];
  const historyStart = new Date(start); historyStart.setUTCFullYear(historyStart.getUTCFullYear() - 1);
  const [eloRows, pedigreeRows, history, personnel] = await Promise.all([
    prisma.clubEloFixtureSnapshot.findMany({ where: { modelVersion: CLUB_ELO_MODEL_VERSION, fixtureId: { in: rows.map((row) => row.fixtureId) } } }),
    pedigreeSnapshots(teamIds, start, new Date(), persistPedigree),
    prisma.fixturePrediction.findMany({ where: { kickoff: { gte: historyStart, lt: end }, leagueId: { in: [...new Set(rows.map((row) => row.leagueId))] }, homeGoals: { not: null }, awayGoals: { not: null } }, select: { fixtureId: true, leagueId: true, season: true, kickoff: true, homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true } }),
    prisma.fixturePersonnelFeatures.findMany({ where: { fixtureId: { in: rows.map((row) => row.fixtureId) }, calculatedAt: { lt: end } }, orderBy: { calculatedAt: "desc" } }),
  ]);
  const elo = new Map(eloRows.map((row) => [row.fixtureId, row]));
  const pedigree = new Map(pedigreeRows.map((row) => [row.teamId, row]));
  const personnelByTeam = new Map<string, typeof personnel[number]>();
  for (const feature of personnel) { const key = `${feature.fixtureId}:${feature.teamId}`; if (!personnelByTeam.has(key)) personnelByTeam.set(key, feature); }
  const teamContext = (teamId: number, fixture: typeof rows[number]) => {
    const prior = history.filter((match) => match.kickoff < fixture.kickoff && (match.homeTeamId === teamId || match.awayTeamId === teamId)).sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime());
    const form = prior.slice(0, 5), season = prior.filter((match) => match.season === computeSeason(fixture.kickoff));
    const leagueSeason = history.filter((match) => match.leagueId === fixture.leagueId && match.season === computeSeason(fixture.kickoff) && match.kickoff < fixture.kickoff);
    const table = new Map<number, { points: number; played: number }>();
    for (const match of leagueSeason) for (const id of [match.homeTeamId, match.awayTeamId]) { const item = table.get(id) ?? { points: 0, played: 0 }; item.points += points(match, id); item.played++; table.set(id, item); }
    const ranked = [...table].filter(([, item]) => item.played > 0).sort((a, b) => b[1].points / b[1].played - a[1].points / a[1].played);
    const standingIndex = ranked.findIndex(([id]) => id === teamId);
    const feature = personnelByTeam.get(`${fixture.fixtureId}:${teamId}`);
    return { formPpg: form.length ? form.reduce((sum, match) => sum + points(match, teamId), 0) / form.length : null, seasonPpg: season.length ? season.reduce((sum, match) => sum + points(match, teamId), 0) / season.length : null, standingRank: standingIndex >= 0 ? standingIndex + 1 : null, standingSize: ranked.length || null, restDays: prior[0] ? (fixture.kickoff.getTime() - prior[0].kickoff.getTime()) / 86_400_000 : null, importantAbsences: feature?.importantAbsences ?? null, strengthLoss: feature?.strengthLoss ?? null, missingGoalkeeper: feature?.missingGoalkeeper ?? null, missingKeyScorer: feature?.missingKeyScorer ?? null, coachChangedRecently: feature?.coachChangedRecently ?? null, lineupAvailable: feature?.lineupSnapshotId != null };
  };
  return rows.map(({ oddsCurrentBooks, ...row }) => {
    const fixture = { ...row, oddsCurrentBooks };
    return {
      ...row,
      oddsBooks: oddsCurrentBooks ?? row.oddsBooks,
      elo: elo.get(row.fixtureId) ?? null,
      pedigree: pedigree.has(row.homeTeamId) && pedigree.has(row.awayTeamId) ? { home: pedigree.get(row.homeTeamId)!, away: pedigree.get(row.awayTeamId)! } : null,
      context: { home: teamContext(row.homeTeamId, fixture), away: teamContext(row.awayTeamId, fixture) },
    };
  });
}

export type TicketEmptyReason = "WAITING_FOR_ODDS" | "INSUFFICIENT_ELO_HISTORY" | "NOT_ENOUGH_VALUE_LEGS" | "NOT_ENOUGH_CONTEXTUAL_LEGS" | "NOT_ENOUGH_BALANCED_LEGS" | "CONTEXT_VETO";

function emptyReason(strategy: "VALUE" | "ELO_INTUITION", rows: IntuitionSource[], tickets: IntuitionTicket[]): TicketEmptyReason | null {
  if (tickets.length) return null;
  const withOdds = rows.filter((row) => Array.isArray(row.oddsBooks) && row.oddsBooks.length > 0);
  if (withOdds.length < 3) return "WAITING_FOR_ODDS";
  if (strategy === "ELO_INTUITION" && rows.filter((row) => row.elo && Math.min(row.elo.homeLongSample, row.elo.awayLongSample) >= 10 && Math.min(row.elo.homeFastSample, row.elo.awayFastSample) >= 5).length < 3) return "INSUFFICIENT_ELO_HISTORY";
  const candidates = strategy === "VALUE" ? rankIntuitionCandidates(rows) : rankEloCandidates(rows);
  if (candidates.length >= 3) return "NOT_ENOUGH_BALANCED_LEGS";
  if (strategy === "VALUE") return candidates.length < 3 ? "NOT_ENOUGH_VALUE_LEGS" : null;
  if (rankEloDivergences(rows).some((item) => item.reason === "CONTEXT_VETO")) return "CONTEXT_VETO";
  return candidates.length < 3 ? "NOT_ENOUGH_CONTEXTUAL_LEGS" : null;
}

function draft(strategy: string, tickets: IntuitionTicket[], now: Date) {
  return tickets.map((ticket) => ({
    strategy, slot: ticket.slot, status: "DRAFT", combinedOdds: ticket.odds, naturalCombinedOdds: ticket.odds, estimatedPriceCount: ticket.legs.filter((leg) => leg.priceKind === "SYNTHETIC").length, priceKind: ticket.legs.every((leg) => leg.priceKind === "DIRECT") ? "DIRECT" : ticket.odds == null ? "NONE" : "SYNTHETIC", generatedAt: now, lockedAt: null, hit: null, profit: null, settledAt: null,
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
    const candidates = strategy === "VALUE" ? rankIntuitionCandidates(rows) : rankEloCandidates(rows);
    const vetoed = strategy === "VALUE" ? [] : rankEloDivergences(rows).filter((item) => item.reason === "CONTEXT_VETO");
    const beforeVeto = candidates.length + vetoed.length;
    return { strategy, frozen: persisted.length > 0, tickets, emptyReason: persisted.length ? null : emptyReason(strategy, rows, built), coverage: { fixtures: rows.length, withOdds: rows.filter((r) => Array.isArray(r.oddsBooks) && r.oddsBooks.length > 0).length, candidates: candidates.length, beforeVeto }, vetoes: [...new Set(vetoed.flatMap((item) => item.details ?? []))] };
  }) };
}

/** Volá kurzový cron. Draft se nemění v historický záznam dříve než dvě hodiny před první nohou. */
export async function captureIntuitionTickets(fixtureId: number, at: Date): Promise<number> {
  const trigger = await prisma.fixturePrediction.findUnique({ where: { fixtureId }, select: { kickoff: true } });
  if (!trigger || trigger.kickoff <= at) return 0;
  const windowKey = localDateKey(trigger.kickoff);
  const rows = await sources(windowKey);
  const divergences = rankEloDivergences(rows);
  if (divergences.length) await prisma.clubEloDivergence.createMany({
    data: divergences.map((item) => ({ ...item, modelVersion: CLUB_ELO_MODEL_VERSION, policyVersion: INTUITION_POLICY_VERSION, observedAt: at })),
    skipDuplicates: true,
  });
  let saved = 0;
  let lockedRows: IntuitionSource[] | null = null;
  for (const strategy of ["VALUE", "ELO_INTUITION"] as const) {
    if (await prisma.intuitionTicket.count({ where: { windowKey, strategy, policyVersion: INTUITION_POLICY_VERSION } })) continue;
    let tickets = strategy === "VALUE" ? buildIntuitionTickets(rows, windowKey) : buildEloIntuitionTickets(rows, windowKey);
    if (!tickets.length) continue;
    const firstKickoff = Math.min(...tickets.flatMap((ticket) => ticket.legs.map((leg) => leg.kickoff.getTime())));
    if (firstKickoff - at.getTime() > LOCK_MINUTES * 60_000) continue;
    lockedRows ??= await sources(windowKey, true);
    tickets = strategy === "VALUE" ? buildIntuitionTickets(lockedRows, windowKey) : buildEloIntuitionTickets(lockedRows, windowKey);
    if (!tickets.length) continue;
    await prisma.$transaction(tickets.map((ticket) => prisma.intuitionTicket.create({ data: {
    windowKey, strategy, slot: ticket.slot, policyVersion: INTUITION_POLICY_VERSION, status: "LOCKED", combinedOdds: ticket.odds, naturalCombinedOdds: ticket.odds, estimatedPriceCount: ticket.legs.filter((leg) => leg.priceKind === "SYNTHETIC").length, priceKind: ticket.legs.every((leg) => leg.priceKind === "DIRECT") ? "DIRECT" : ticket.odds == null ? "NONE" : "SYNTHETIC",
    generatedAt: at, lockedAt: at,
    legs: { create: ticket.legs.map((leg) => ({
      fixtureId: leg.fixtureId, leagueId: leg.leagueId, kickoff: leg.kickoff, homeName: leg.homeName, awayName: leg.awayName,
      winner: leg.winner, winnerName: leg.winnerName, totalSide: leg.total, totalLine: leg.line, role: leg.role,
      score: leg.score, modelProbability: leg.modelProbability, marketWinnerProbability: leg.marketWinnerProbability,
      eloLongProbability: leg.eloLongProbability, eloFastProbability: leg.eloFastProbability, eloWinnerProbability: leg.eloWinnerProbability, eloJointProbability: leg.eloJointProbability,
      eloLongHomeRating: leg.eloLongHomeRating, eloLongAwayRating: leg.eloLongAwayRating, eloFastHomeRating: leg.eloFastHomeRating, eloFastAwayRating: leg.eloFastAwayRating,
      eloLongSample: leg.eloLongSample, eloFastSample: leg.eloFastSample, modelExpectedValue: leg.modelExpectedValue ?? (leg.decimalOdds ? leg.modelProbability * leg.decimalOdds - 1 : null), eloExpectedValue: leg.eloExpectedValue,
      winnerOdds: leg.winnerOdds, decimalOdds: leg.decimalOdds, bookmaker: leg.bookmaker, priceKind: leg.priceKind, reason: leg.reason, risk: leg.risk,
      pedigreeScore: leg.pedigreeScore, pedigreeSnapshotId: leg.pedigreeSnapshotId, contextScore: leg.contextScore, contextSupports: leg.contextSupports ?? [], contextVetoes: leg.contextVetoes ?? [],
    })) },
    } })));
    saved += tickets.length;
  }
  return saved;
}

export async function settleIntuitionTickets(fixtureId: number, homeGoals: number | null, awayGoals: number | null, at: Date) {
  if (homeGoals == null || awayGoals == null) return 0;
  const divergences = await prisma.clubEloDivergence.findMany({ where: { fixtureId, settledAt: null }, select: { id: true, winner: true } });
  for (const item of divergences) await prisma.clubEloDivergence.update({ where: { id: item.id }, data: { homeGoals, awayGoals, hit: item.winner === "HOME" ? homeGoals > awayGoals : awayGoals > homeGoals, settledAt: at } });
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
