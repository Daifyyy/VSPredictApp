import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { PerformancePressureShadowV5 } from '../picks/performancePressureShadowV5';

type Audit = { fixtureId: number; capturedAt: string | null;
  competition: { homeTeamId: number; awayTeamId: number } | null;
  performancePressure: PerformancePressureShadowV5 | null };

/** Transfer only the frozen identity and, when enabled, the research subdocument.
 * Never download the full prediction snapshot for each hourly selection pass. */
export async function dailySourceAudit(fixtureIds: number[], includePressure: boolean) {
  const ids = [...new Set(fixtureIds)];
  if (!ids.length) return new Map<number, Audit>();
  const rows = await prisma.$queryRaw<Audit[]>`
    SELECT "fixtureId", "inputSnapshot"->>'capturedAt' AS "capturedAt",
      jsonb_build_object('homeTeamId', "inputSnapshot" #> '{competition,homeTeamId}',
        'awayTeamId', "inputSnapshot" #> '{competition,awayTeamId}') AS competition,
      CASE WHEN ${includePressure} THEN "inputSnapshot"->'performancePressure' ELSE NULL END AS "performancePressure"
    FROM "FixturePrediction" WHERE "fixtureId" IN (${Prisma.join(ids)})`;
  return new Map(rows.map(row => [row.fixtureId, row]));
}
