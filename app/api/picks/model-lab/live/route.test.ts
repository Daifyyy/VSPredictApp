import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn(), compute: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/data/livePerformanceStore', async importOriginal => ({ ...await importOriginal<object>(), readLivePerformance: m.read, computeLivePerformance: m.compute }));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/authUser', () => ({ getCurrentUser: m.user }));
vi.mock('@/lib/entitlements', () => ({ getEntitlement: (user: unknown) => ({ pro: Boolean(user) }) }));
vi.mock('@/lib/rateLimit', () => ({ allowRequest: () => true, clientKey: () => 'test', tooMany: vi.fn() }));
import { GET } from './route';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it('checks PRO before reading shared private reports', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true'); m.user.mockResolvedValue(null);
  expect((await GET(new Request('https://local/api?detail=true'))).status).toBe(403);
  expect(m.read).not.toHaveBeenCalled(); expect(m.compute).not.toHaveBeenCalled();
});
it('missing summary returns explicit unavailability without history fallback', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true'); m.read.mockResolvedValue({ report: null, stale: true });
  const response = await GET(new Request('https://local/api'));
  expect(response.status).toBe(503); expect(response.headers.get('Retry-After')).toBe('900');
  expect(m.compute).not.toHaveBeenCalled();
});
it('never returns private rows in public summaries and marks stale data', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
  const report = { asOf: '2026-09-29T00:00:00Z', cards: [{ market: 'LIVE_GOALS', sample: 1, current: [{ homeName: 'Secret' }], recent: [{ decimalOdds: 2 }] }] };
  m.read.mockResolvedValue({ report, stale: true, limitedReason: 'LIVE_PERFORMANCE_STALE' });
  const response = await GET(new Request('https://local/api'));
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.json(); expect(body.stale).toBe(true);
  expect(body.cards[0]).not.toHaveProperty('current'); expect(body.cards[0]).not.toHaveProperty('recent');
  m.user.mockResolvedValue({ id: 'pro' });
  const privateResponse = await GET(new Request('https://local/api?detail=true'));
  expect(privateResponse.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await privateResponse.json()).cards[0].current).toEqual(report.cards[0].current);
});
