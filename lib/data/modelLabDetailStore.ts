import { createHash } from 'node:crypto';
import { prisma } from '../db';
import { sharedReadCache } from '../boundedCache';
import { modelLabSegments, type ModelLabContext, type ModelLabLedgerRow } from '../picks/modelLab';
import { strategyCohort } from '../picks/strategyCohort';
import { MODEL_LAB_REPORT_VERSION } from './modelStrategyLedger';

export function modelLabDetailKey(context: ModelLabContext, strategy: string, policyVersion: number) {
  const identity = JSON.stringify({ context, strategy, policyVersion, cohort: strategyCohort(strategy, context), report: MODEL_LAB_REPORT_VERSION });
  return `model-lab-detail:v1:${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}
type Row = ModelLabLedgerRow & { dataWarning?: string };
export function modelLabDetailRows(rows: Row[]) {
  return rows.slice(-100).reverse().map(row => ({
    id: row.id, fixtureId: row.fixtureId, kickoff: row.kickoff.toISOString(), strategy: row.strategy, policyVersion: row.policyVersion,
    market: row.market, side: row.side, line: row.line, modelProbability: row.modelProbability,
    marketProbability: row.marketProbability, decimalOdds: row.decimalOdds, qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
    homeGoals: row.homeGoals, awayGoals: row.awayGoals, actualCount: row.actualCount, storedHit: row.storedHit,
    priceClv: row.priceClv, dataWarning: row.dataWarning,
  }));
}
type Report = { version: 1; context: ModelLabContext; strategy: string; policyVersion: number;
  asOf: string; inputHash: string; totalRows: number; detailRows: ReturnType<typeof modelLabDetailRows>; segments: ReturnType<typeof modelLabSegments> };

/** Receives the already-loaded full cohort. No second ledger scan. Not a GET helper. */
export async function persistModelLabDetail(context: ModelLabContext, strategy: string, policyVersion: number, rows: Row[], now: Date) {
  const key = modelLabDetailKey(context, strategy, policyVersion);
  const inputHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  // Only a tiny hash is read, never the previous full segment report.
  const existing = await prisma.$queryRaw<Array<{ inputHash: string | null }>>`
    SELECT payload->>'inputHash' AS "inputHash" FROM "ApiCache" WHERE key = ${key}
  `;
  if (existing[0]?.inputHash === inputHash) {
    await prisma.$executeRaw`
      UPDATE "ApiCache" SET payload = jsonb_set(payload, '{asOf}', to_jsonb(${now.toISOString()}::text)),
        "updatedAt" = ${now}, "expiresAt" = ${new Date(+now + 90 * 86400_000)}
      WHERE key = ${key} AND payload->>'inputHash' = ${inputHash}
    `;
    sharedReadCache.delete(key);
    return { recomputed: false };
  }
  const report: Report = { version: 1, context, strategy, policyVersion, asOf: now.toISOString(), inputHash,
    totalRows: rows.length, detailRows: modelLabDetailRows(rows), segments: modelLabSegments(rows) };
  const serialized = JSON.stringify(report);
  if (Buffer.byteLength(serialized, 'utf8') > 250_000) throw new Error('MODEL_LAB_DETAIL_TOO_LARGE');
  const payload = JSON.parse(serialized), expiresAt = new Date(+now + 90 * 86400_000);
  await prisma.apiCache.upsert({ where: { key }, create: { key, payload, expiresAt }, update: { payload, expiresAt } });
  sharedReadCache.delete(key);
  return { recomputed: true };
}

/** Caller MUST check PRO authorization before calling; never share an HTTP response. */
export async function readModelLabDetail(context: ModelLabContext, strategy: string, policyVersion: number, page: number, now = new Date()) {
  const key = modelLabDetailKey(context, strategy, policyVersion);
  const report = await sharedReadCache.read(key, 15 * 60_000, async () => {
    const row = await prisma.apiCache.findUnique({ where: { key }, select: { payload: true } });
    const value = row?.payload as unknown as Report | null;
    return value?.version === 1 && value.context === context && value.strategy === strategy && value.policyVersion === policyVersion
      && Number.isFinite(Date.parse(value.asOf)) && Array.isArray(value.detailRows) && Array.isArray(value.segments) ? value : null;
  });
  if (!report) return null;
  const start = (page - 1) * 30;
  const stale = +now - Date.parse(report.asOf) > 26 * 3600_000;
  return { detailRows: report.detailRows.slice(start, start + 30), segments: report.segments,
    page, nextPage: start + 30 < report.detailRows.length ? page + 1 : null,
    totalRows: report.totalRows, retainedRows: report.detailRows.length,
    asOf: report.asOf, stale, limitedReason: stale ? 'MODEL_LAB_DETAIL_STALE' : null };
}
