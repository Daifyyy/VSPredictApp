import { prisma } from '../lib/db';
import { isDateKey } from '../lib/picks/strategyHub';
import { pragueDateBounds } from '../lib/recentWindow';
import { oneXTwoProspectiveQuery } from '../lib/data/oneXTwoProspectiveQuery';
import { evaluateOneXTwoProspective, type ProspectiveRow } from '../lib/picks/oneXTwoProspective';
import { ONE_X_TWO_EVALUATION_KEY } from '../lib/data/oneXTwoEvaluationStore';
import { Prisma } from '@prisma/client';

async function main() {
  const [startDay, endExclusive, action] = process.argv.slice(2);
  if (action && action !== '--publish-summary') throw Error('Unknown action');
  if (!isDateKey(startDay ?? '') || !isDateKey(endExclusive ?? '')) throw Error('Pass start and exclusive end YYYY-MM-DD (max 93 days)');
  const start = pragueDateBounds(startDay).start, end = pragueDateBounds(endExclusive).start;
  const query = oneXTwoProspectiveQuery(start, end), asOf = new Date();
  const rows = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000'");
    return tx.$queryRaw<ProspectiveRow[]>(query);
  }, { timeout: 15000 });
  if (rows.length > 10000) throw Error('AUDIT_TOO_LARGE_NARROW_DATE_WINDOW');
  const report = { ...evaluateOneXTwoProspective(rows, asOf), window: { openedFrom: start.toISOString(), openedBefore: end.toISOString() } };
  const json = JSON.stringify(report);
  if (action === '--publish-summary') {
    if (Buffer.byteLength(json) > 250_000) throw Error('REPORT_TOO_LARGE');
    const payload = JSON.parse(json) as Prisma.InputJsonValue, expiresAt = new Date(+asOf + 90 * 86400_000);
    await prisma.apiCache.upsert({ where: { key: ONE_X_TWO_EVALUATION_KEY }, create: { key: ONE_X_TWO_EVALUATION_KEY, payload, expiresAt }, update: { payload, expiresAt } });
  }
  console.log(JSON.stringify({ estimatedReadBytes: Buffer.byteLength(JSON.stringify(rows)), providerCalls: 0,
    databaseWrites: action === '--publish-summary' ? 1 : 0, report }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
