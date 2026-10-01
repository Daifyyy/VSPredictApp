import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rows: vi.fn(), fixtures: vi.fn(), stats: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { autonomousTipSnapshot: { findMany: m.rows }, fixturePrediction: { findMany: m.fixtures }, matchStatCache: { findMany: m.stats } } }));
vi.mock('@/lib/authUser', () => ({ getCurrentUser: m.user }));
vi.mock('@/lib/entitlements', () => ({ getEntitlement: (user: unknown) => ({ pro: !!user }) }));
vi.mock('@/lib/rateLimit', () => ({ allowRequest: () => true, tooMany: vi.fn() }));
import { GET } from './route';
const request = () => new Request('https://local/api?strategy=OVER_25&policyVersion=2');
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ id: 'pro' }); m.rows.mockResolvedValue([]); m.fixtures.mockResolvedValue([]); });
it('does not read protected history without PRO', async () => {
  m.user.mockResolvedValue(null); expect((await GET(request())).status).toBe(403);
  expect(m.rows).not.toHaveBeenCalled();
});
it('omits model JSON and unused audit fields from a bounded activity query', async () => {
  const response = await GET(request()); expect(response.status).toBe(200);
  const query = m.rows.mock.calls[0][0];
  expect(query.take).toBe(100); expect(query.select.modelInputSnapshot).toBeUndefined();
  expect(query.select).toMatchObject({ stake: true, closingMarketProbability: true, actualCount: true });
  expect(query.where).toMatchObject({ strategy: 'OVER_25', policyVersion: 2, modelContext: 'LEAGUE', status: 'candidate' });
  expect(m.fixtures).not.toHaveBeenCalled(); expect(m.stats).not.toHaveBeenCalled();
});
