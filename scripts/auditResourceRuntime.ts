/** Bounded, read-only operating audit. No provider calls, refreshes or payload exports. */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const end = new Date(process.argv[2] ?? new Date().toISOString());
  if (!Number.isFinite(+end)) throw new Error('Invalid end date');
  const start = new Date(+end - 24 * 3600_000);
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
    const runs = process.argv[3] === '--reports-only' ? [] : await tx.$queryRaw`
      WITH recent AS MATERIALIZED (
        SELECT job, status, "startedAt", "durationMs", "processed", errors, "apiCalls",
          details #>> '{teamProfiles,enabled}' AS reuse
        FROM "CronRun" WHERE "startedAt" >= ${start} AND "startedAt" < ${end}
        ORDER BY "startedAt" DESC LIMIT 5001
      )
      SELECT job, count(*)::int AS runs, min("startedAt") AS first, max("startedAt") AS last,
        count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
        count(*) FILTER (WHERE status = 'DEGRADED')::int AS degraded,
        count(*) FILTER (WHERE status = 'RUNNING')::int AS unfinished,
        sum("durationMs")::float8 AS "durationMs", max("durationMs")::int AS "maxDurationMs",
        sum(processed)::int AS processed, sum(errors)::int AS errors,
        sum("apiCalls")::int AS "apiCalls",
        count(*) FILTER (WHERE reuse = 'true')::int AS "reuseEnabledRuns"
      FROM recent GROUP BY job ORDER BY sum("durationMs") DESC
    `;
    const reports = await tx.$queryRaw`
      SELECT split_part(key, ':', 1) AS family, count(*)::int AS reports,
        min("updatedAt") AS "oldestUpdatedAt", max("updatedAt") AS "latestUpdatedAt",
        min(payload->>'asOf') AS "oldestAsOf", max(payload->>'asOf') AS "latestAsOf",
        sum(pg_column_size(payload))::float8 AS "storedBytes"
      FROM "ApiCache"
      WHERE key = 'operations:report:v1' OR key = 'live-performance:v1'
        OR key LIKE 'quick-performance:v1:%' OR key LIKE 'legacy-stats:v1:%'
        OR key LIKE 'model-lab-detail:%' OR key LIKE 'strategy-metrics:v1:%'
      GROUP BY split_part(key, ':', 1)
    `;
    const opponentProjection = await tx.$queryRaw`
      WITH sample AS MATERIALIZED (
        SELECT m.* FROM "MatchStatCache" m
        WHERE "teamId" = (SELECT "homeTeamId" FROM "FixturePrediction" WHERE kickoff >= ${end} ORDER BY kickoff ASC LIMIT 1)
        LIMIT 100
      )
      SELECT count(*)::int AS rows, sum(octet_length(to_jsonb(s)::text))::float8 AS "fullJsonBytes",
        sum(octet_length(jsonb_build_object('fixtureId', "fixtureId", 'shots', shots,
          'shotsOnTarget', "shotsOnTarget", 'shotsInsideBox', "shotsInsideBox")::text))::float8 AS "projectedJsonBytes"
      FROM sample s
    `;
    return { runs, reports, opponentProjection };
  }, { timeout: 15_000, maxWait: 5_000 });
  console.log(JSON.stringify({ start: start.toISOString(), end: end.toISOString(),
    caveats: ['At most 5001 cron runs; 5001 runs means truncated. Projection sample limited to 100 rows of one team.',
      'Durations, stored JSON sizes and estimated JSON bytes are not billed transfer or proof of production environment flags.'], ...result }, null, 2));
}
main().catch(() => { console.error('RUNTIME_AUDIT_FAILED: connection or bounded read failed; no writes performed.'); process.exitCode = 1; }).finally(() => db.$disconnect());
