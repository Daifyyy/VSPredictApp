import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rows: vi.fn(), fixtures: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { quickOverviewSelection: { findMany: m.rows }, fixturePrediction: { findMany: m.fixtures } } }));
vi.mock('@/lib/authUser', () => ({ getCurrentUser: m.user }));
vi.mock('@/lib/entitlements', () => ({ getEntitlement: (user: unknown) => ({ pro: !!user }) }));
vi.mock('@/lib/rateLimit', () => ({ allowRequest: () => true, tooMany: vi.fn() }));
vi.mock('@/lib/data/quickOverviewStore', () => ({ QUICK_OVERVIEW_POLICY_VERSION: 2 }));
vi.mock('@/lib/logError', () => ({ logError: vi.fn() }));
import { GET } from './route';
const kickoff = new Date('2026-10-01T18:00:00Z');
const row = (id: string) => ({ id, fixtureId: 1, kickoff, qualifiedAt: new Date('2026-10-01T08:00:00Z'), settledAt: null,
  closedAt: new Date('2026-10-01T17:50:00Z'), marketProbability: .5, closingMarketProbability: .6,
  decimalOdds: 2, profit: 1, hit: true });
const request = (query = '') => new Request(`https://local/api?category=goals${query}`);
beforeEach(() => {
  vi.clearAllMocks(); m.user.mockResolvedValue({ id: 'pro' }); m.rows.mockResolvedValue([]);
  m.fixtures.mockResolvedValue([{ fixtureId: 1, leagueId: 39, kickoff, homeName: 'Home', awayName: 'Away' }]);
});
it('protects data before database reads', async () => {
  m.user.mockResolvedValue(null); expect((await GET(request())).status).toBe(403);
  expect(m.rows).not.toHaveBeenCalled();
});
it('rejects impossible dates, reversed ranges and oversized pages before querying', async () => {
  for (const query of ['&from=2026-02-30', '&from=2026-13-01', '&from=2026-10-02&to=2026-10-01', '&limit=31']) {
    expect((await GET(request(query))).status).toBe(400);
  }
  expect(m.rows).not.toHaveBeenCalled();
});
it('does not query fixtures when the ledger is empty', async () => {
  const response = await GET(request());
  expect(await response.json()).toEqual({ rows: [], nextCursor: null });
  expect(m.fixtures).not.toHaveBeenCalled();
});
it('preserves pricing and CLV and selects only explicit scalar fields', async () => {
  m.rows.mockResolvedValue([row('a'), row('b')]);
  const response = await GET(request('&limit=1'));
  const body = await response.json();
  expect(body.nextCursor).toBe('a'); expect(body.rows).toHaveLength(1);
  expect(body.rows[0]).toMatchObject({ homeName: 'Home', decimalOdds: 2, profit: 1 });
  expect(body.rows[0].clv).toBeCloseTo(.1);
  expect(m.rows.mock.calls[0][0].select).not.toHaveProperty('reason');
  expect(m.rows.mock.calls[0][0].select).not.toHaveProperty('score');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it('continues past a bounded CLV scan with no matches', async () => {
  m.rows.mockResolvedValue(Array.from({ length: 6 }, (_, id) => ({ ...row(String(id)), closingMarketProbability: .4 })));
  const body = await (await GET(request('&limit=1&clv=positive'))).json();
  expect(body).toEqual({ rows: [], nextCursor: '4' });
  expect(m.rows.mock.calls[0][0].take).toBe(6);
});
it('does not disguise database failure as empty history', async () => {
  m.rows.mockRejectedValue(new Error('offline'));
  const response = await GET(request()); expect(response.status).toBe(502);
  expect(await response.json()).toHaveProperty('error');
});
