import { prisma } from '../db';
import { sharedReadCache } from '../boundedCache';
import type { evaluateOneXTwoProspective } from '../picks/oneXTwoProspective';

export type OneXTwoEvaluationReport = ReturnType<typeof evaluateOneXTwoProspective> & { stale?: boolean; window?: { openedFrom: string; openedBefore: string } };
export const ONE_X_TWO_EVALUATION_KEY = 'one-x-two:prospective-report:v1';
/** Only a small precomputed report; no historic query, training or writes on GET. */
export async function loadOneXTwoEvaluation(): Promise<OneXTwoEvaluationReport | null> {
  const report = await sharedReadCache.read(ONE_X_TWO_EVALUATION_KEY, 15 * 60_000, async () => {
    const row = await prisma.apiCache.findUnique({ where: { key: ONE_X_TWO_EVALUATION_KEY }, select: { payload: true } });
    const payload = row?.payload as unknown as OneXTwoEvaluationReport | undefined;
    if (!payload || payload.version !== 1 || !Number.isFinite(Date.parse(payload.asOf)) || !payload.coverage || !Array.isArray(payload.cohorts)) return null;
    return payload;
  });
  return report ? { ...report, stale: Date.now() - Date.parse(report.asOf) > 48 * 3600_000 } : null;
}
