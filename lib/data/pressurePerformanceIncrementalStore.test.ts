import { afterEach, expect, it, vi } from 'vitest';
import { emptyPressureAccumulator } from '../picks/pressurePerformanceIncremental';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), execute: vi.fn(), find: vi.fn(), upsert: vi.fn() }));
vi.mock('../db', () => ({ prisma: { $transaction: mocks.transaction } }));
import { refreshIncrementalPressurePerformance } from './pressurePerformanceIncrementalStore';
const now = new Date('2026-10-01T12:00:00Z');
const tx = { $queryRaw: mocks.query, $executeRaw: mocks.execute, apiCache: { findUnique: mocks.find, upsert: mocks.upsert } };
function setup() {
  mocks.transaction.mockImplementation((run: (value: typeof tx) => unknown) => run(tx));
  mocks.find.mockResolvedValue({ payload: { version: 1, generation: 'test-generation', accumulator: emptyPressureAccumulator() } });
  mocks.execute.mockResolvedValue(0); mocks.upsert.mockResolvedValue({});
}
afterEach(() => vi.resetAllMocks());
it('does no scoring or writes when another worker owns the transaction lock', async () => {
  setup(); mocks.query.mockResolvedValueOnce([{ locked: false }]);
  expect((await refreshIncrementalPressurePerformance(now, 'report')).status).toBe('LEASE_HELD');
  expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
});
it('leaves the contribution state untouched when source fingerprints match', async () => {
  setup(); mocks.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([]);
  const result = await refreshIncrementalPressurePerformance(now, 'report');
  expect(result.processed).toBe(0); expect(result.status).toBe('COMPLETE');
  expect(mocks.execute).toHaveBeenCalledTimes(1); // statement timeout only
  expect(mocks.upsert).toHaveBeenCalledTimes(1); // last successful full check
  expect(mocks.upsert.mock.calls[0][0].where.key).toBe('report');
});
it('bulk-writes fifty contributions with a fixed query count and keeps a partial bootstrap private', async () => {
  setup(); mocks.find.mockResolvedValue(null);
  mocks.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce(Array.from({ length: 50 }, (_, fixtureId) => ({
    fixtureId, kickoff: '2026-10-01T10:00:00Z', status: 'NS', homeGoals: null, awayGoals: null, previous: null, fingerprint: `hash-${fixtureId}`,
    inputSnapshot: { performancePressure: { version: 5, capturedAt: '2026-10-01T08:00:00Z', context: 'LEAGUE', artifactVersion: 1, marketProbabilities: { OVER_25: .6 } } },
  })));
  const result = await refreshIncrementalPressurePerformance(now, 'report', 1);
  expect(result).toMatchObject({ processed: 50, status: 'DEFERRED' });
  expect(mocks.query).toHaveBeenCalledTimes(2);
  expect(mocks.execute).toHaveBeenCalledTimes(2); // timeout and one bulk insert
  expect(mocks.find).toHaveBeenCalledTimes(1);
  expect(mocks.upsert).toHaveBeenCalledTimes(1); // accumulator only, not public report
  expect(mocks.upsert.mock.calls[0][0].where.key).not.toBe('report');
  const rows = JSON.parse(mocks.execute.mock.calls[1][1]);
  expect(rows).toHaveLength(50);
  expect(rows[0].payload.contribution).not.toHaveProperty('inputSnapshot');
});
it('fails closed on damaged accumulator metadata rather than rebuilding into an existing generation', async () => {
  setup(); mocks.find.mockResolvedValue({ payload: { version: 9 } });
  mocks.query.mockResolvedValueOnce([{ locked: true }]);
  await expect(refreshIncrementalPressurePerformance(now, 'report')).rejects.toThrow('STATE_INVALID');
  expect(mocks.upsert).not.toHaveBeenCalled();
});
