/** Read-only, bounded to one selected Prague day. No source snapshot export or writes. */
import { Prisma, PrismaClient } from '@prisma/client';
import { pressureDailyProjectionQuery } from '../lib/data/pressureDailyProjection';
import { pragueDateBounds } from '../lib/recentWindow';
import { localDateKey } from '../lib/competitionGrouping';
const db = new PrismaClient();
async function main() {
  let date = process.argv[2];
  if (!date || (date !== 'latest' && !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('DATE_REQUIRED');
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
    if (date === 'latest') {
      const rows = await tx.$queryRaw<Array<{ kickoff: Date }>>`
        SELECT "kickoff" FROM "FixturePrediction"
        WHERE "modelContext" = 'LEAGUE' AND "inputSnapshot"#>'{performancePressure,version}' = '5'::jsonb
        ORDER BY "kickoff" DESC LIMIT 1
      `;
      if (!rows.length) throw new Error('NO_V5_ROWS');
      date = localDateKey(rows[0].kickoff);
    }
    const { start, end } = pragueDateBounds(date);
    const query = pressureDailyProjectionQuery(start, end);
    const sizes = await tx.$queryRaw(Prisma.sql`
      WITH projected AS (${query})
      SELECT count(*)::int AS rows,
        coalesce(sum(octet_length(f."inputSnapshot"::text)),0)::float8 AS "fullBytes",
        coalesce(sum(octet_length(p.pressure::text)),0)::float8 AS "projectedBytes",
        count(*) FILTER (WHERE
          p.pressure->'goalLambda' IS DISTINCT FROM f."inputSnapshot"#>'{performancePressure,goalLambda}'
          OR p.pressure->'marketProbabilities' IS DISTINCT FROM f."inputSnapshot"#>'{performancePressure,marketProbabilities}'
          OR p.pressure#>'{expectedMatchShape,home,shots}' IS DISTINCT FROM f."inputSnapshot"#>'{performancePressure,expectedMatchShape,home,shots}'
          OR p.pressure#>'{expectedMatchShape,away,shots}' IS DISTINCT FROM f."inputSnapshot"#>'{performancePressure,expectedMatchShape,away,shots}'
        )::int AS "mismatches"
      FROM projected p JOIN "FixturePrediction" f USING ("fixtureId")
    `);
    const plan = await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
    return { sizes, plan };
  }, { timeout: 20_000 });
  console.log(JSON.stringify({ asOf: new Date().toISOString(), date, source: 'ESTIMATE',
    warning: 'JSON sizes and one execution, not billed transfer or monthly savings.', ...result }, null, 2));
}
main().catch(() => { console.error('READ_ONLY_PROJECTION_AUDIT_FAILED'); process.exitCode = 1; }).finally(() => db.$disconnect());
