/** Read-only query-plan check. No provider calls, exports, training or DB writes. */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
    const size = await tx.$queryRaw<Array<{ rows: number; fullBytes: number; scoringBytes: number }>>`
      SELECT count(*)::int AS rows,
        coalesce(sum(octet_length("inputSnapshot"::text)),0)::float8 AS "fullBytes",
        coalesce(sum(octet_length(jsonb_build_object(
          'version', "inputSnapshot" #> '{performancePressure,version}',
          'capturedAt', "inputSnapshot" #> '{performancePressure,capturedAt}',
          'context', "inputSnapshot" #> '{performancePressure,context}',
          'artifactVersion', "inputSnapshot" #> '{performancePressure,artifactVersion}',
          'marketProbabilities', "inputSnapshot" #> '{performancePressure,marketProbabilities}',
          'mainMarketProbabilities', "inputSnapshot" #> '{performancePressure,mainMarketProbabilities}',
          'currentOver25', "inputSnapshot" #> '{performancePressure,currentOver25}'
        )::text)),0)::float8 AS "scoringBytes"
      FROM "FixturePrediction" WHERE "inputSnapshot" #> '{performancePressure,version}' = '5'::jsonb
    `;
    const plan = await tx.$queryRaw<Array<{ 'QUERY PLAN': unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT "fixtureId", "kickoff", "status", "homeGoals", "awayGoals",
        jsonb_build_object('performancePressure', jsonb_build_object(
          'version', "inputSnapshot" #> '{performancePressure,version}',
          'capturedAt', "inputSnapshot" #> '{performancePressure,capturedAt}',
          'context', "inputSnapshot" #> '{performancePressure,context}',
          'artifactVersion', "inputSnapshot" #> '{performancePressure,artifactVersion}',
          'marketProbabilities', "inputSnapshot" #> '{performancePressure,marketProbabilities}',
          'mainMarketProbabilities', "inputSnapshot" #> '{performancePressure,mainMarketProbabilities}',
          'currentOver25', "inputSnapshot" #> '{performancePressure,currentOver25}'
        )) AS "inputSnapshot"
      FROM "FixturePrediction" WHERE "inputSnapshot" #> '{performancePressure,version}' = '5'::jsonb
    `;
    return { size, plan };
  }, { timeout: 20_000 });
  console.log(JSON.stringify({ asOf: new Date().toISOString(), source: 'ESTIMATE',
    warning: 'JSON byte estimates and one query execution are not billed network transfer or monthly compute.', ...result }, null, 2));
}
main().catch(() => { console.error('RESOURCE_AUDIT_FAILED: connection or query failed; no writes performed.'); process.exitCode = 1; }).finally(() => db.$disconnect());
