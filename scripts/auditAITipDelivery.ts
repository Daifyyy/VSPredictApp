/** Bounded read-only diagnostics; no provider requests, refresh or Telegram delivery. */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const now = new Date(), since = new Date(+now - 3 * 86400_000);
  const evidence = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
    const runs = await tx.$queryRaw`
      SELECT job, status, "startedAt", details #>> '{ai,status}' AS "aiStatus",
        details #>> '{ai,captured}' AS captured,
        jsonb_array_length(details #> '{ai,rejected}') AS "rejectedCount"
      FROM "CronRun" WHERE "startedAt" >= ${since}
        AND job IN ('daily-selection', 'telegram-digest')
      ORDER BY "startedAt" DESC LIMIT 8`;
    const projections = await tx.$queryRaw`
      SELECT key, "updatedAt", payload->>'asOf' AS "asOf",
        jsonb_array_length(payload->'forecasts') AS forecasts,
        jsonb_array_length(payload->'picks') AS picks,
        jsonb_array_length(payload->'rejected') AS "rejectedCount"
      FROM "ApiCache" WHERE key LIKE 'ai-research-day:v1:%'
        AND "updatedAt" >= ${since} ORDER BY "updatedAt" DESC LIMIT 3`;
    const publications = await tx.$queryRaw`
      SELECT "dateKey", kind, status, attempts, "sentAt",
        jsonb_array_length(payload #> '{ai,picks}') AS "aiPicks"
      FROM "TelegramPublication" WHERE "createdAt" >= ${since}
      ORDER BY "createdAt" DESC LIMIT 10`;
    return { runs, projections, publications };
  }, { timeout: 15_000, maxWait: 5_000 });
  console.log(JSON.stringify({ at: now.toISOString(), caveat: 'Stored runs and projections do not prove current runtime flags or delivery.', ...evidence }, null, 2));
}
main().catch(() => { console.error('AI_DELIVERY_AUDIT_FAILED: bounded read unavailable; no writes performed.'); process.exitCode = 1; }).finally(() => db.$disconnect());
