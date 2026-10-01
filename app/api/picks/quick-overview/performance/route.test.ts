import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn(), compute: vi.fn() }));
vi.mock('@/lib/data/quickPerformanceStore', () => ({ readQuickPerformance: m.read, computeQuickPerformance: m.compute }));
vi.mock('@/lib/rateLimit', () => ({ allowRequest: () => true, clientKey: () => 'test', tooMany: vi.fn() }));
import { GET } from './route';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it('does not rebuild missing accounting on a GET', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
  m.read.mockResolvedValue({ report: null, asOf: null, stale: true, limitedReason: 'QUICK_PERFORMANCE_NOT_CAPTURED' });
  const response = await GET(new Request('https://local/api/picks/quick-overview/performance'));
  expect(response.status).toBe(503);
  expect(response.headers.get('Retry-After')).toBe('900');
  expect(m.compute).not.toHaveBeenCalled();
});
it('returns old saved accounting with an explicit stale warning and no CDN caching', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
  m.read.mockResolvedValue({ report: { cards: [{ category: 'goals' }] }, asOf: '2026-09-29T00:00:00Z', stale: true, limitedReason: 'QUICK_PERFORMANCE_STALE' });
  const response = await GET(new Request('https://local/api/picks/quick-overview/performance?context=NATIONAL'));
  expect(m.read).toHaveBeenCalledWith('NATIONAL');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ cards: [{ category: 'goals' }], stale: true });
  expect(m.compute).not.toHaveBeenCalled();
});
