import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), upsert: vi.fn() }));
vi.mock('../db', () => ({ prisma: { $queryRaw: mocks.query, apiCache: { upsert: mocks.upsert } } }));
import { refreshPressurePerformance } from './pressurePerformanceStore';
it('projects the scoring JSON on the database side and keeps stored baseline fields', async () => {
  mocks.query.mockResolvedValue([]);
  await refreshPressurePerformance();
  const sql = mocks.query.mock.calls[0][0].join('');
  expect(sql).toContain('jsonb_build_object');
  expect(sql).toContain('mainMarketProbabilities');
  expect(sql).not.toContain('SELECT *');
  expect(sql).not.toContain('oddsBooks');
  expect(mocks.upsert.mock.calls[0][0].create.payload.cohorts).toEqual([]);
});
