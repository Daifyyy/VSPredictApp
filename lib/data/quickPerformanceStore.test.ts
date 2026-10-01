import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rows: vi.fn(), read: vi.fn(), write: vi.fn(), transaction: vi.fn() }));
vi.mock('../db', () => ({ prisma: {
  quickOverviewSelection: { findMany: m.rows }, apiCache: { findUnique: m.read, upsert: m.write }, $transaction: m.transaction,
} }));
vi.mock('./quickOverviewStore', () => ({ QUICK_OVERVIEW_POLICY_VERSION: 2 }));
import { computeQuickPerformance, quickPerformanceKey, readQuickPerformance, refreshQuickPerformance } from './quickPerformanceStore';
import { sharedReadCache } from '../boundedCache';
import { quickOverviewSummary } from '../picks/quickOverviewPerformance';
const now = new Date('2026-10-01T12:00:00Z');
const row = { category: 'goals', policyVersion: 2, modelContext: 'LEAGUE', qualifiedAt: new Date('2026-09-29T10:00:00Z'),
  kickoff: new Date('2026-09-29T18:00:00Z'), hit: true, decimalOdds: 2, marketProbability: .5,
  closingMarketProbability: .55, closedAt: new Date('2026-09-29T17:45:00Z') };
beforeEach(() => {
  vi.clearAllMocks();
  for (const context of ['LEAGUE', 'EURO_CUP', 'NATIONAL'] as const) sharedReadCache.delete(quickPerformanceKey(context));
  m.rows.mockResolvedValue([row]); m.read.mockResolvedValue(null);
  m.write.mockImplementation(args => Promise.resolve(args));
  m.transaction.mockImplementation(writes => Promise.all(writes));
});
it('does not load history or write when a saved report is missing', async () => {
  expect(await readQuickPerformance('LEAGUE', now)).toMatchObject({ report: null, stale: true, limitedReason: 'QUICK_PERFORMANCE_NOT_CAPTURED' });
  expect(m.rows).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
});
it('uses the same scoring with a minimal projection', async () => {
  const report = await computeQuickPerformance('LEAGUE', now);
  expect(report.cards.find(card => card.category === 'goals')?.summary).toEqual(quickOverviewSummary([row]));
  expect(m.rows.mock.calls[0][0].select).not.toHaveProperty('series');
  expect(m.rows.mock.calls[0][0].select).not.toHaveProperty('modelInputSnapshot');
  expect(m.rows.mock.calls[0][0].where.modelContext).toBe('LEAGUE');
});
it('batch-refreshes contexts without mixing them and invalidates a cached miss', async () => {
  await readQuickPerformance('LEAGUE', now);
  await refreshQuickPerformance(now);
  expect(m.rows).toHaveBeenCalledTimes(1);
  expect(m.transaction).toHaveBeenCalledTimes(1);
  expect(m.write).toHaveBeenCalledTimes(3);
  const league = m.write.mock.calls[0][0].create.payload;
  expect(league.cards.find((card: { category: string }) => card.category === 'goals').summary.settled).toBe(1);
  expect(m.write.mock.calls[1][0].create.payload.cards.every((card: { summary: { total: number } }) => card.summary.total === 0)).toBe(true);
  m.read.mockResolvedValue({ payload: league });
  const stored = await readQuickPerformance('LEAGUE', new Date(+now + 27 * 3600_000));
  expect(stored.stale).toBe(true);
  expect(stored.limitedReason).toBe('QUICK_PERFORMANCE_STALE');
  expect(stored.report?.cards).toEqual(league.cards);
});
it('rejects mismatched and incomplete reports instead of serving false empty accounting', async () => {
  m.read.mockResolvedValue({ payload: { version: 1, context: 'NATIONAL', policyVersion: 2, asOf: now.toISOString(), cards: [] } });
  expect((await readQuickPerformance('LEAGUE', now)).report).toBeNull();
});
