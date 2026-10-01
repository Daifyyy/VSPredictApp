import 'server-only';
import { prisma } from '../db';
import { sharedReadCache } from '../boundedCache';
import type { auditPipeline } from '../operations';

export const OPERATIONS_REPORT_KEY = 'operations:report:v1';
type Report = Awaited<ReturnType<typeof auditPipeline>>;

/** Reads only: absent/expired reports never trigger an audit or a write. */
export async function readOperationsReport(now = new Date()) {
  const report = await sharedReadCache.read('operations:report', 15 * 60_000, async () => {
    const row = await prisma.apiCache.findUnique({ where: { key: OPERATIONS_REPORT_KEY }, select: { payload: true } });
    if (!row) return null;
    const value = row.payload as unknown as Report;
    if (!value || !Array.isArray(value.coverage) || !Number.isFinite(Date.parse(value.asOf))) return null;
    return { ...value,
      latestRuns: value.latestRuns.map(run => ({ ...run, startedAt: new Date(run.startedAt) })),
      calibration: value.calibration.map(item => ({ ...item, lastRunAt: item.lastRunAt ? new Date(item.lastRunAt) : null })),
    };
  });
  const stale = !report || +now - Date.parse(report.asOf) > 26 * 3600_000;
  return { report, asOf: report?.asOf ?? null, stale, limitedReason: !report ? 'AUDIT_NOT_CAPTURED' : stale ? 'AUDIT_STALE' : null };
}
