import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { PressurePerformanceRow } from '../picks/pressurePerformance';
import { emptyPressureAccumulator, pressureAccumulatorReport, pressureContribution, replacePressureContribution, type PressureAccumulator, type PressureContribution } from '../picks/pressurePerformanceIncremental';

const STATE_KEY = 'pressure-performance:v5:incremental:1';
const BATCH_SIZE = 50;
type State = { version: 1; generation: string; accumulator: PressureAccumulator };
type StoredContribution = { fingerprint: string; contribution: PressureContribution };
type ChangedRow = PressurePerformanceRow & { fingerprint: string; previous: StoredContribution | null };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function incrementalPressureChangesQuery(prefix: string) {
  // PostgreSQL tuple revision is a conservative change detector, not model identity.
  // Even an unrelated odds update may trigger rescoring; it cannot hide a result repair.
  // Expand the scoring JSON only AFTER limiting changed rows to one batch.
  return Prisma.sql`
    WITH changed AS MATERIALIZED (
      SELECT f."fixtureId", f."kickoff", f."status", f."homeGoals", f."awayGoals", f."inputSnapshot",
        (f.xmin::text || ':' || f."predictedAt"::text) AS fingerprint, c.payload AS previous
      FROM "FixturePrediction" f
      LEFT JOIN "ApiCache" c ON c.key = ${prefix} || f."fixtureId"::text
      WHERE c.payload->>'fingerprint' IS DISTINCT FROM (f.xmin::text || ':' || f."predictedAt"::text)
        AND f."inputSnapshot" #> '{performancePressure,version}' = '5'::jsonb
      ORDER BY f."fixtureId" LIMIT ${BATCH_SIZE}
    )
    SELECT "fixtureId", "kickoff", "status", "homeGoals", "awayGoals", fingerprint, previous,
      jsonb_build_object('performancePressure', jsonb_build_object(
        'version', "inputSnapshot" #> '{performancePressure,version}',
        'capturedAt', "inputSnapshot" #> '{performancePressure,capturedAt}',
        'context', "inputSnapshot" #> '{performancePressure,context}',
        'artifactVersion', "inputSnapshot" #> '{performancePressure,artifactVersion}',
        'marketProbabilities', "inputSnapshot" #> '{performancePressure,marketProbabilities}',
        'mainMarketProbabilities', "inputSnapshot" #> '{performancePressure,mainMarketProbabilities}',
        'currentOver25', "inputSnapshot" #> '{performancePressure,currentOver25}'
      )) AS "inputSnapshot"
    FROM changed
  `;
}

/** Fixed query count per batch; no provider calls or per-fixture database queries. */
export async function refreshIncrementalPressurePerformance(now: Date, reportKey: string, budgetMs = 8_000) {
  const started = Date.now(), deadline = started + Math.min(8_000, Math.max(1, budgetMs));
  let processed = 0;
  do {
    const result = await prisma.$transaction(async tx => {
      const locks = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(58491, 5) AS locked`;
      if (!locks[0]?.locked) return { status: 'LEASE_HELD' as const, processed: 0 };
      await tx.$executeRaw`SET LOCAL statement_timeout = '4000ms'`;
      const saved = await tx.apiCache.findUnique({ where: { key: STATE_KEY }, select: { payload: true } });
      const state = saved?.payload as unknown as State | undefined;
      if (state && (state.version !== 1 || !state.generation || state.accumulator?.version !== 1)) throw new Error('PRESSURE_INCREMENTAL_STATE_INVALID');
      const current: State = state ?? { version: 1, generation: randomUUID(), accumulator: emptyPressureAccumulator() };
      const prefix = `pressure-contribution:v1:${current.generation}:`;
      const rows = await tx.$queryRaw<ChangedRow[]>(incrementalPressureChangesQuery(prefix));
      const updates = rows.map(row => {
        if (row.previous && !Object.hasOwn(row.previous, 'contribution')) throw new Error('PRESSURE_CONTRIBUTION_INVALID');
        const contribution = pressureContribution(row);
        replacePressureContribution(current.accumulator, row.previous ? row.previous.contribution : undefined, contribution);
        return { key: `${prefix}${row.fixtureId}`, payload: { fingerprint: row.fingerprint, contribution } };
      });
      // One bulk write and one state write in the same transaction: restart/correction safe.
      if (updates.length) await tx.$executeRaw`
        INSERT INTO "ApiCache" (key, payload, "expiresAt", "updatedAt")
        SELECT x.key, x.payload, TIMESTAMP '2099-01-01', CURRENT_TIMESTAMP
        FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS x(key text, payload jsonb)
        ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = EXCLUDED."updatedAt"
      `;
      if (Buffer.byteLength(JSON.stringify(current), 'utf8') > 250_000) throw new Error('PRESSURE_ACCUMULATOR_TOO_LARGE');
      const expiresAt = new Date('2099-01-01T00:00:00Z');
      if (updates.length || !saved) await tx.apiCache.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, payload: json(current), expiresAt }, update: { payload: json(current) } });
      const complete = rows.length < BATCH_SIZE;
      if (complete) {
        const report = { ...pressureAccumulatorReport(current.accumulator), asOf: now.toISOString(),
          collectionEnabled: process.env.PRESSURE_V5_ENABLED !== 'false', opportunitiesEnabled: process.env.PRESSURE_V5_OPPORTUNITIES_ENABLED === 'true' };
        const payload = json(report);
        await tx.apiCache.upsert({ where: { key: reportKey }, create: { key: reportKey, payload, expiresAt }, update: { payload, expiresAt } });
      }
      // Never publish a partial bootstrap as if it were complete historical accounting.
      return { status: complete ? 'COMPLETE' as const : 'DEFERRED' as const, processed: rows.length };
    }, { maxWait: 1_000, timeout: 6_000 });
    processed += result.processed;
    if (result.status !== 'DEFERRED') return { ...result, processed, durationMs: Date.now() - started };
  } while (Date.now() + 2_000 < deadline);
  return { status: 'DEFERRED' as const, processed, durationMs: Date.now() - started };
}
