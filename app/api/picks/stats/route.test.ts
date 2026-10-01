import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn(), compute: vi.fn() }));
vi.mock('@/lib/data/legacyStatsStore', () => ({ readLegacyStats: m.read, computeLegacyStats: m.compute }));
vi.mock('@/lib/rateLimit', () => ({ allowRequest: () => true, clientKey: () => 'test', tooMany: vi.fn() }));
import { GET } from './route';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it('never computes on a saving-mode miss', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true'); m.read.mockResolvedValue(null);
  const result = await GET(new Request('https://local/api/picks/stats'));
  expect(result.status).toBe(503); expect(result.headers.get('Retry-After')).toBe('900');
  expect(m.compute).not.toHaveBeenCalled();
});
it('keeps custom-rule limits and stale status in the response without a fallback computation', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
  m.read.mockResolvedValue({ stale: true, backtest: null, backtestLimitedReason: 'CUSTOM_BACKTEST_NOT_PRECOMPUTED' });
  const result = await GET(new Request('https://local/api/picks/stats?minProb=0.71'));
  expect(result.headers.get('Cache-Control')).toBe('no-store');
  expect(await result.json()).toMatchObject({ stale: true, backtest: null, backtestLimitedReason: 'CUSTOM_BACKTEST_NOT_PRECOMPUTED' });
  expect(m.compute).not.toHaveBeenCalled();
});
it('retains arbitrary-rule evaluation when saving reads are off', async () => {
  vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'false'); m.compute.mockResolvedValue({ stale: false });
  expect((await GET(new Request('https://local/api/picks/stats?minProb=0.71&minEdge=0'))).status).toBe(200);
  expect(m.compute).toHaveBeenCalledWith({ market: 'win', venue: 'home', minProb: .71, minEdge: 0 });
  expect(m.read).not.toHaveBeenCalled();
});
