import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn() }));
vi.mock('@/lib/cronAuth', () => ({ requireCronAuth: mocks.auth }));
vi.mock('@/lib/db', () => ({ prisma: { fixturePrediction: { findMany: mocks.find } } }));
import { GET } from './route';
afterEach(() => vi.resetAllMocks());
it('checks authorization before reading any schedule', async () => {
  mocks.auth.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await GET(new Request('https://app.test/api/cron/live-schedule'))).status).toBe(401);
  expect(mocks.find).not.toHaveBeenCalled();
});
it('exposes only bounded timing metadata with a single projected query', async () => {
  mocks.auth.mockResolvedValue(null); mocks.find.mockResolvedValue([{ kickoff: new Date(), status: 'NS' }]);
  const response = await GET(new Request('https://app.test/api/cron/live-schedule'));
  const payload = await response.json();
  expect(Object.keys(payload).sort()).toEqual(['generatedAt', 'validUntil', 'version', 'windows']);
  expect(payload.windows).toHaveLength(1);
  expect(mocks.find.mock.calls[0][0].select).toEqual({ kickoff: true, status: true });
  expect(mocks.find).toHaveBeenCalledTimes(1);
});
it('does not publish a truncated program as complete', async () => {
  mocks.auth.mockResolvedValue(null); mocks.find.mockResolvedValue(Array(1001).fill({ kickoff: new Date(), status: 'NS' }));
  expect((await GET(new Request('https://app.test/api/cron/live-schedule'))).status).toBe(503);
});
