import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('../db', () => ({ prisma: { $queryRaw: m.query, $executeRaw: m.execute, apiCache: { findUnique: m.read, upsert: m.write } } }));
import { modelLabDetailKey, persistModelLabDetail, readModelLabDetail } from './modelLabDetailStore';
import { sharedReadCache } from '../boundedCache';
import { modelLabSegments, type ModelLabLedgerRow } from '../picks/modelLab';
const now = new Date('2026-10-01T12:00:00Z');
const row = (id = '1'): ModelLabLedgerRow => ({
  id, fixtureId: Number(id), leagueId: 39, kickoff: new Date('2026-09-29T18:00:00Z'),
  qualifiedAt: null, strategy: 'OVER_25', policyVersion: 1, modelContext: 'LEAGUE', modelVersion: 7,
  market: 'OVER_25', side: 'OVER', line: 2.5, stake: 1, modelProbability: .6, marketProbability: .5,
  decimalOdds: 2, closingMarketProbability: .55, closedAt: new Date('2026-09-29T17:45:00Z'),
  homeGoals: 2, awayGoals: 1,
});
beforeEach(() => {
  vi.clearAllMocks(); m.query.mockResolvedValue([]); m.read.mockResolvedValue(null);
  sharedReadCache.delete(modelLabDetailKey('LEAGUE', 'OVER_25', 1));
});
it('preserves all-cohort segments and nullable qualification times', async () => {
  const rows = [row()];
  await persistModelLabDetail('LEAGUE', 'OVER_25', 1, rows, now);
  const payload = m.write.mock.calls[0][0].create.payload;
  expect(payload.segments).toEqual(JSON.parse(JSON.stringify(modelLabSegments(rows))));
  expect(payload.detailRows[0].qualifiedAt).toBeNull();
  expect(payload.totalRows).toBe(1);
});
it('does not transfer or rebuild the previous report when inputs match', async () => {
  await persistModelLabDetail('LEAGUE', 'OVER_25', 1, [row()], now);
  m.query.mockResolvedValue([{ inputHash: m.write.mock.calls[0][0].create.payload.inputHash }]);
  expect(await persistModelLabDetail('LEAGUE', 'OVER_25', 1, [row()], now)).toEqual({ recomputed: false });
  expect(m.write).toHaveBeenCalledTimes(1);
  expect(m.execute).toHaveBeenCalledTimes(1);
  expect(m.query.mock.calls[1][0].join('')).toContain("payload->>'inputHash'");
});
it('recomputes after a result correction and separates policy/context keys', async () => {
  await persistModelLabDetail('LEAGUE', 'OVER_25', 1, [row()], now);
  m.query.mockResolvedValue([{ inputHash: m.write.mock.calls[0][0].create.payload.inputHash }]);
  expect(await persistModelLabDetail('LEAGUE', 'OVER_25', 1, [{ ...row(), homeGoals: 0, awayGoals: 1 }], now)).toEqual({ recomputed: true });
  expect(m.write).toHaveBeenCalledTimes(2);
  expect(modelLabDetailKey('LEAGUE', 'OVER_25', 1)).not.toBe(modelLabDetailKey('NATIONAL', 'OVER_25', 1));
  expect(modelLabDetailKey('LEAGUE', 'OVER_25', 1)).not.toBe(modelLabDetailKey('LEAGUE', 'OVER_25', 2));
});
it('paginates the original last 100 rows without changing the full-cohort segment sample', async () => {
  await persistModelLabDetail('LEAGUE', 'OVER_25', 1, Array.from({ length: 105 }, (_, i) => row(String(i + 1))), now);
  m.read.mockResolvedValue({ payload: m.write.mock.calls[0][0].create.payload });
  const first = await readModelLabDetail('LEAGUE', 'OVER_25', 1, 1, now);
  const last = await readModelLabDetail('LEAGUE', 'OVER_25', 1, 4, new Date(+now + 27 * 3600_000));
  expect(first?.detailRows).toHaveLength(30);
  expect(first?.detailRows[0].id).toBe('105');
  expect(first?.nextPage).toBe(2);
  expect(first?.totalRows).toBe(105);
  expect(last?.detailRows).toHaveLength(10);
  expect(last?.detailRows.at(-1)?.id).toBe('6');
  expect(last?.nextPage).toBeNull();
  expect(last?.stale).toBe(true);
  expect(first?.segments).toEqual(last?.segments);
  expect(m.read).toHaveBeenCalledTimes(1);
});
it('missing reads never compute or write', async () => {
  expect(await readModelLabDetail('LEAGUE', 'OVER_25', 1, 1, now)).toBeNull();
  expect(m.query).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
});
