import 'server-only';
import { prisma } from '../db';
import { readDetailInsight, readDetailPublications, readDetailTicketLegs } from './matchDetailExtras';

/** Bounded stored-only foundation. Does not qualify tips or regenerate predictions. */
export async function readMatchDetail(fixtureId: number, pro: boolean) {
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) return null;
  const row = await prisma.fixturePrediction.findUnique({ where: { fixtureId }, select: {
    fixtureId: true, kickoff: true, homeName: true, awayName: true, status: true, homeTeamId: true, awayTeamId: true,
    homeGoals: true, awayGoals: true, available: true, predictedAt: true,
    modelVersion: true, modelContext: true, contextVersion: true,
    homeWin: true, draw: true, awayWin: true, over25: true, bttsYes: true,
    lambdaHome: true, lambdaAway: true, lowConfidence: true,
  } });
  if (!row) return null;
  const valid = row.available && row.predictedAt < row.kickoff;
  const [flow, publications, ticketLegs] = await Promise.all([
    readDetailInsight(fixtureId, row.kickoff, row.status, pro, row.homeTeamId, row.awayTeamId).catch(() => ({ insight: null, reason: 'FLOW_UNAVAILABLE' })),
    readDetailPublications(fixtureId, pro).then(items => ({ items, unavailable: false })).catch(() => ({ items: [], unavailable: true })),
    readDetailTicketLegs(fixtureId, pro).then(items => ({ items, unavailable: false })).catch(() => ({ items: [], unavailable: true })),
  ]);
  return { fixtureId: row.fixtureId, kickoff: row.kickoff.toISOString(), homeName: row.homeName,
    awayName: row.awayName, status: row.status, homeGoals: row.homeGoals, awayGoals: row.awayGoals,
    asOf: row.predictedAt.toISOString(), locked: !pro, flow, publications, ticketLegs,
    limitedReason: !valid ? 'PREMATCH_PREDICTION_NOT_AVAILABLE' : null,
    forecast: pro && valid ? { homeWin: row.homeWin, draw: row.draw, awayWin: row.awayWin,
      over25: row.over25, bttsYes: row.bttsYes, lambdaHome: row.lambdaHome, lambdaAway: row.lambdaAway,
      lowConfidence: row.lowConfidence, modelVersion: row.modelVersion,
      modelContext: row.modelContext, contextVersion: row.contextVersion } : null };
}
