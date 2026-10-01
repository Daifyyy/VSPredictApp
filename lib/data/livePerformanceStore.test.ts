import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rows: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('../db', () => ({ prisma: { liveCandidateSnapshot: { findMany: m.rows }, apiCache: { findUnique: m.read, upsert: m.write } } }));
import { computeLivePerformance, readLivePerformance, refreshLivePerformance, publicLiveCards, LIVE_PERFORMANCE_KEY } from './livePerformanceStore';
import { sharedReadCache } from '../boundedCache';
const now = new Date('2026-10-01T12:00:00Z');
const base = { id: 'one', fixtureId: 1, market: 'LIVE_GOALS', minute: 30, hit: true, profit: 1,
  modelProbability: .6, settlementStatus: 'HIT', homeName: 'Protected team' };
beforeEach(() => {
  vi.clearAllMocks(); sharedReadCache.delete(LIVE_PERFORMANCE_KEY);
  m.rows.mockResolvedValue([base]); m.read.mockResolvedValue(null);
});
it('missing or malformed saved reports never trigger history reads or writes', async () => {
  expect(await readLivePerformance(now)).toMatchObject({ report: null, stale: true });
  expect(m.rows).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
  sharedReadCache.delete(LIVE_PERFORMANCE_KEY);
  m.read.mockResolvedValue({ payload: { version: 1, asOf: now.toISOString(), cards: [] } });
  expect((await readLivePerformance(now)).report).toBeNull();
});
it('preserves full accounting while bounding saved details, and strips public picks', async () => {
  m.rows.mockResolvedValue([base, { ...base, id: 'loss', profit: -1, hit: false },
    ...Array.from({ length: 35 }, (_, id) => ({ ...base, id: String(id), hit: null, profit: null, settlementStatus: 'PENDING' }))]);
  const full = await computeLivePerformance(now);
  await refreshLivePerformance(now);
  const saved = m.write.mock.calls[0][0].create.payload;
  expect(publicLiveCards(saved)).toEqual(publicLiveCards(full));
  const card = saved.cards.find((c: { market: string }) => c.market === 'LIVE_GOALS');
  expect(card).toMatchObject({ currentCount: 35, currentTruncated: true, sample: 2, profit: 0, maxDrawdown: 1 });
  expect(card.brier).toBeCloseTo(.26); expect(card.current).toHaveLength(30);
  expect(JSON.stringify(publicLiveCards(saved))).not.toContain('Protected team');
  expect(m.rows.mock.calls[0][0].select).not.toHaveProperty('inputSnapshot');
});
it('invalidates cached misses and exposes the actual timestamp and staleness', async () => {
  await readLivePerformance(now); await refreshLivePerformance(now);
  m.read.mockResolvedValue({ payload: m.write.mock.calls[0][0].create.payload });
  const saved = await readLivePerformance(new Date(+now + 27 * 3600_000));
  expect(saved).toMatchObject({ asOf: now.toISOString(), stale: true, limitedReason: 'LIVE_PERFORMANCE_STALE' });
  expect(m.read).toHaveBeenCalledTimes(2); expect(m.rows).toHaveBeenCalledOnce();
});
it('does not overwrite a valid report with an oversized payload', async () => {
  m.rows.mockResolvedValue([{ ...base, homeName: 'x'.repeat(260_000) }]);
  await expect(refreshLivePerformance(now)).rejects.toThrow('LIVE_REPORT_TOO_LARGE');
  expect(m.write).not.toHaveBeenCalled();
});
