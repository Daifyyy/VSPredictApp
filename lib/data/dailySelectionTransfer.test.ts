import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({
  marketSignalSnapshot: { findMany: vi.fn() }, fixturePrediction: { findMany: vi.fn() },
  apiCache: { findMany: vi.fn() }, $queryRaw: vi.fn(),
}));
vi.mock('../db', () => ({ prisma: db }));
vi.mock('./intuitionTicketStore', () => ({ qualifiedDailyTicketCandidates: async () => ({ groups: [] }) }));
import { loadDailyAdditionalSources } from './dailySelectionAdditionalSources';
beforeEach(() => {
  vi.clearAllMocks();
  db.marketSignalSnapshot.findMany.mockResolvedValue([]);
  db.fixturePrediction.findMany.mockResolvedValue([]);
  db.apiCache.findMany.mockResolvedValue([]);
});
it('does not transfer frozen snapshots or request audits on an empty candidate day', async () => {
  const result = await loadDailyAdditionalSources('2026-10-31', new Date('2026-10-31T10:00:00Z'));
  expect(result.candidates).toEqual([]);
  expect(db.fixturePrediction.findMany).not.toHaveBeenCalled();
  expect(db.$queryRaw).not.toHaveBeenCalled();
});
it('projects only necessary columns and scopes quotes to candidate fixtures', async () => {
  db.marketSignalSnapshot.findMany.mockResolvedValue([{ fixtureId: 12, market: 'TEAM_HOME_05' }]);
  await loadDailyAdditionalSources('2026-10-31', new Date('2026-10-31T10:00:00Z'));
  const request = db.fixturePrediction.findMany.mock.calls[0][0];
  expect(request.select).not.toHaveProperty('inputSnapshot');
  expect(request.where.fixtureId.in).toEqual([12]);
  expect(db.marketSignalSnapshot.findMany.mock.calls[0][0].select).not.toHaveProperty('oddsTimeSeries');
});
