import 'server-only';
import { prisma } from '../db';
import { dailySourceAudit } from './dailySourceAudit';
import { buildMatchInsight, publicMatchInsight } from '../picks/matchInsight';
import { MATCH_FLOW_EVALUATION_VERSION, type MatchFlowEvaluation } from '../picks/matchFlowEvaluation';
import type { PerformancePressureShadow } from '../picks/performancePressureShadow';

/** Stored audit only. A missing final evaluation never triggers settlement on GET. */
export async function readDetailInsight(fixtureId: number, kickoff: Date, status: string, pro: boolean, homeTeamId: number, awayTeamId: number) {
  const source = (await dailySourceAudit([fixtureId], true)).get(fixtureId);
  const pressure = source?.performancePressure as PerformancePressureShadow | null | undefined;
  if (source?.competition?.homeTeamId !== homeTeamId || source?.competition?.awayTeamId !== awayTeamId
    || !pressure || ![3, 5].includes(pressure.version) || !pressure.expectedMatchShape
    || !Number.isFinite(Date.parse(pressure.capturedAt)) || Date.parse(pressure.capturedAt) >= +kickoff)
    return { insight: null, reason: 'FLOW_NOT_CAPTURED' };
  const now = Date.now();
  const final = ['FT', 'AET', 'PEN'].includes(status);
  const saved = final ? await prisma.matchFlowEvaluationSnapshot.findUnique({ where: {
    fixtureId_pressureVersion_evaluationVersion: { fixtureId, pressureVersion: pressure.version, evaluationVersion: MATCH_FLOW_EVALUATION_VERSION },
  }, select: { kickoff: true, status: true, evaluation: true, evaluatedAt: true } }) : null;
  const evaluation = saved?.status === 'SETTLED' && +saved.kickoff === +kickoff
    ? saved.evaluation as unknown as MatchFlowEvaluation | null : null;
  const complete = evaluation?.final && evaluation.diagnosis && Array.isArray(evaluation.components) ? evaluation : null;
  const insight = buildMatchInsight({ pressure, evaluation: complete,
    phase: complete ? 'FINAL' : 'PREMATCH', capturedAt: pressure.capturedAt });
  return { insight: pro ? insight : publicMatchInsight(insight),
    reason: final && !complete ? 'FINAL_AUDIT_PENDING' : (status !== 'NS' || +kickoff <= now) && !final ? 'AWAITING_FINAL_RESULT' : null };
}

type PublishedItem = { id: string; selection: string | null; strategy: string | null;
  decimalOdds: number; bookmaker: string; publishedAt: Date; status: string;
  outcome: string; profit: number | null; priceClv: number | null };

/** These are web-published Daily Selection items, NOT proof of Telegram delivery. */
export async function readDetailPublications(fixtureId: number, pro: boolean) {
  if (!pro) return [];
  return prisma.$queryRaw<PublishedItem[]>`
    SELECT id, snapshot->>'selection' AS selection, snapshot->>'strategy' AS strategy,
      "decimalOdds", bookmaker, "publishedAt", status, outcome, profit, "priceClv"
    FROM "DailySelectionItem" WHERE "fixtureId" = ${fixtureId}
    ORDER BY "publishedAt" DESC, id ASC LIMIT 30`;
}

/** Frozen legs only; neither a new single nor evidence of Telegram publication. */
export async function readDetailTicketLegs(fixtureId: number, pro: boolean) {
  if (!pro) return [];
  return prisma.intuitionTicketLeg.findMany({ where: { fixtureId, ticket: { strategy: { in: ['VALUE', 'ELO_INTUITION'] } } },
    orderBy: [{ kickoff: 'desc' }, { id: 'asc' }], take: 30,
    select: { id: true, ticketId: true, winnerName: true, totalSide: true, totalLine: true,
      decimalOdds: true, bookmaker: true, priceKind: true, hit: true, settledAt: true,
      homeGoals: true, awayGoals: true, priceClv: true, clvMethodVersion: true,
      ticket: { select: { strategy: true, slot: true, windowKey: true, policyVersion: true,
        status: true, lockedAt: true, hit: true, profit: true, naturalCombinedOdds: true } } } });
}
