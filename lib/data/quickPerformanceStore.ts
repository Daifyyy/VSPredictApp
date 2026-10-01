import { createHash } from 'node:crypto';
import { prisma } from '../db';
import { sharedReadCache } from '../boundedCache';
import { QUICK_BET_CATEGORIES, quickOverviewSummary, type QuickPerformanceRow } from '../picks/quickOverviewPerformance';
import { QUICK_OVERVIEW_POLICY_VERSION } from './quickOverviewStore';
import { FIXTURE_LIST_LEAGUE_IDS } from './catalog';

const CONTEXTS = ['LEAGUE', 'EURO_CUP', 'NATIONAL'] as const;
type Context = typeof CONTEXTS[number];
const identity = createHash('sha256').update(JSON.stringify({
  policy: QUICK_OVERVIEW_POLICY_VERSION, categories: QUICK_BET_CATEGORIES, leagues: FIXTURE_LIST_LEAGUE_IDS,
})).digest('hex').slice(0, 16);
export const quickPerformanceKey = (context: Context) => `quick-performance:v1:${identity}:${context}`;
const select = {
  category: true, policyVersion: true, modelContext: true, qualifiedAt: true, kickoff: true,
  hit: true, decimalOdds: true, marketProbability: true, closingMarketProbability: true, closedAt: true,
} as const;
const where = {
  policyVersion: QUICK_OVERVIEW_POLICY_VERSION, category: { in: [...QUICK_BET_CATEGORIES] },
  leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] }, kickoff: { not: null },
};
function summarize(context: Context, rows: QuickPerformanceRow[], now: Date) {
  return { version: 1 as const, context, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, asOf: now.toISOString(),
    cards: QUICK_BET_CATEGORIES.map(category => ({ category, policyVersion: QUICK_OVERVIEW_POLICY_VERSION,
      summary: quickOverviewSummary(rows.filter(row => row.category === category)) })) };
}
type Report = ReturnType<typeof summarize>;

/** Legacy read mode still uses exactly the old scoring, but only necessary columns. */
export async function computeQuickPerformance(context: Context, now = new Date()) {
  const rows = await prisma.quickOverviewSelection.findMany({
    where: { ...where, modelContext: context }, select, orderBy: { qualifiedAt: 'asc' },
  });
  return summarize(context, rows.map(row => ({ ...row, kickoff: row.kickoff! })), now);
}

/** One batched read, three small outputs. Only explicit admin / existing nightly cron. */
export async function refreshQuickPerformance(now = new Date()) {
  const rows = await prisma.quickOverviewSelection.findMany({
    where: { ...where, modelContext: { in: [...CONTEXTS] } }, select, orderBy: { qualifiedAt: 'asc' },
  });
  const reports = CONTEXTS.map(context => summarize(context,
    rows.filter(row => row.modelContext === context).map(row => ({ ...row, kickoff: row.kickoff! })), now));
  const writes = reports.map(report => {
    const serialized = JSON.stringify(report);
    if (Buffer.byteLength(serialized, 'utf8') > 250_000) throw new Error('QUICK_REPORT_TOO_LARGE');
    const key = quickPerformanceKey(report.context), payload = JSON.parse(serialized);
    const expiresAt = new Date(+now + 90 * 86400_000);
    return prisma.apiCache.upsert({ where: { key }, create: { key, payload, expiresAt }, update: { payload, expiresAt } });
  });
  await prisma.$transaction(writes);
  for (const context of CONTEXTS) sharedReadCache.delete(quickPerformanceKey(context));
  return { processed: rows.length, reports: reports.length, asOf: now.toISOString() };
}

/** Never fills a missing report by loading history or computing it during GET. */
export async function readQuickPerformance(context: Context, now = new Date()) {
  const report = await sharedReadCache.read(quickPerformanceKey(context), 15 * 60_000, async () => {
    const row = await prisma.apiCache.findUnique({ where: { key: quickPerformanceKey(context) }, select: { payload: true } });
    const value = row?.payload as unknown as Report | undefined;
    return value?.version === 1 && value.context === context && value.policyVersion === QUICK_OVERVIEW_POLICY_VERSION
      && Number.isFinite(Date.parse(value.asOf)) && Date.parse(value.asOf) <= +now
      && Array.isArray(value.cards) && value.cards.length === QUICK_BET_CATEGORIES.length
      && QUICK_BET_CATEGORIES.every(category => value.cards.some(card => card.category === category && card.summary))
      ? value : null;
  });
  const stale = !report || +now - Date.parse(report.asOf) > 26 * 3600_000;
  return { report, asOf: report?.asOf ?? null, stale,
    limitedReason: !report ? 'QUICK_PERFORMANCE_NOT_CAPTURED' : stale ? 'QUICK_PERFORMANCE_STALE' : null };
}
