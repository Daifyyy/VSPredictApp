import 'server-only';
import { prisma } from '../db';
import type { MatchContextSnapshot } from '../picks/matchContext';

/** Only one compact frozen JSON subdocument; never build profiles or collect on GET. */
export async function readMatchContext(fixtureId: number, pro: boolean) {
  if (!pro) return { locked: true, context: null, reason: 'PRO_REQUIRED' };
  const rows = await prisma.$queryRaw<Array<{ kickoff: Date; homeTeamId: number; awayTeamId: number; context: MatchContextSnapshot | null }>>`
    SELECT kickoff, "homeTeamId", "awayTeamId", "inputSnapshot"->'matchContext' AS context
    FROM "FixturePrediction" WHERE "fixtureId" = ${fixtureId} LIMIT 1`;
  const row = rows[0], ctx = row?.context;
  if (!ctx || ctx.version !== 1 || ctx.fixtureId !== fixtureId || ctx.home?.teamId !== row.homeTeamId || ctx.away?.teamId !== row.awayTeamId
    || Date.parse(ctx.kickoff) !== +row.kickoff || !Number.isFinite(Date.parse(ctx.capturedAt)) || Date.parse(ctx.capturedAt) >= +row.kickoff)
    return { locked: false, context: null, reason: 'PREMATCH_CONTEXT_NOT_CAPTURED' };
  return { locked: false, context: ctx, reason: null };
}
