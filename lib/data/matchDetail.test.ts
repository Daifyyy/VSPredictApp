import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const read = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ prisma: { fixturePrediction: { findUnique: read } } }));
vi.mock('./matchDetailExtras', () => ({ readDetailInsight: async () => ({ insight: null, reason: 'FLOW_NOT_CAPTURED' }), readDetailPublications: async () => [], readDetailTicketLegs: async () => [] }));
import { readMatchDetail } from './matchDetail';
beforeEach(() => { read.mockReset(); read.mockResolvedValue({ fixtureId: 1, available: true,
  kickoff: new Date('2026-10-31T18:00:00Z'), predictedAt: new Date('2026-10-31T08:00:00Z'), homeWin: .6 }); });
it('does not query invalid identities', async () => { expect(await readMatchDetail(-1, true)).toBeNull(); expect(read).not.toHaveBeenCalled(); });
it('does not expose numeric forecasts to public callers and does not select JSON histories', async () => {
  expect((await readMatchDetail(1, false))?.forecast).toBeNull();
  expect(read.mock.calls[0][0].select).not.toHaveProperty('inputSnapshot');
});
it('returns stored values without inference and rejects post-kickoff predictions', async () => {
  expect((await readMatchDetail(1, true))?.forecast?.homeWin).toBe(.6);
  read.mockResolvedValue({ available: true, kickoff: new Date(0), predictedAt: new Date(1) });
  expect((await readMatchDetail(1, true))?.limitedReason).toBe('PREMATCH_PREDICTION_NOT_AVAILABLE');
});
