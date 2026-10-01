import { expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ prisma: { $queryRaw: query } }));
import { loadPressureDailyProjection, pressureDailyProjectionQuery } from './pressureDailyProjection';
it('projects only daily card inputs with parameterized half-open date bounds', async () => {
  const start = new Date('2026-10-01T22:00:00Z'), end = new Date('2026-10-02T22:00:00Z');
  const sql = pressureDailyProjectionQuery(start, end);
  expect(sql.values).toEqual([start, end]);
  expect(sql.sql).toContain('"kickoff" >= ? AND "kickoff" < ?');
  expect(sql.sql).toContain("'5'::jsonb");
  expect(sql.sql).toContain('"modelContext" = \'LEAGUE\'');
  expect(sql.sql).not.toMatch(/SELECT\s+\*|oddsBooks|mainMarketProbabilities|runtimeMs/);
  expect(sql.sql).not.toContain('"inputSnapshot" AS');
  for (const field of ['goalLambda', 'marketProbabilities', 'featureCoverage', 'fallbacks', 'shots', 'chanceShare', 'opennessLabel'])
    expect(sql.sql).toContain(field);
  query.mockResolvedValue([]);
  expect(await loadPressureDailyProjection(start, end)).toEqual([]);
  expect(query).toHaveBeenCalledTimes(1);
});
