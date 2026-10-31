import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ rows: vi.fn(), fetch: vi.fn(), settle: vi.fn() }));
vi.mock('../db', () => ({ prisma: { liveCandidateSnapshot: { findMany: m.rows } } }));
vi.mock('./apiFootball', () => ({ fetchFixturesByIds: m.fetch }));
vi.mock('./liveCenterStore', () => ({ settleLiveCandidates: m.settle }));
import { settleLegacyLiveCandidates } from './legacyLiveSettlement';
beforeEach(() => { vi.clearAllMocks(); m.rows.mockResolvedValue([]); m.settle.mockResolvedValue(1); });
it('does not call the provider when legacy queue is empty', async () => {
  expect(await settleLegacyLiveCandidates()).toBe(0);
  expect(m.fetch).not.toHaveBeenCalled();
  expect(m.rows.mock.calls[0][0]).toMatchObject({ take: 20, select: { fixtureId: true }, where: { settlementStatus: 'PENDING' } });
});
it('batches old candidates and never settles a running fixture', async () => {
  m.rows.mockResolvedValue([{ fixtureId: 1 }, { fixtureId: 2 }]);
  const final = { fixture: { id: 1, status: { short: 'FT' } } };
  m.fetch.mockResolvedValue([final, { fixture: { id: 2, status: { short: '2H' } } }]);
  expect(await settleLegacyLiveCandidates()).toBe(1);
  expect(m.fetch).toHaveBeenCalledExactlyOnceWith([1, 2]);
  expect(m.settle).toHaveBeenCalledExactlyOnceWith(final);
});
