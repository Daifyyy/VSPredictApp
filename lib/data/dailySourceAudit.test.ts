import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const query = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ prisma: { $queryRaw: query } }));
import { dailySourceAudit } from './dailySourceAudit';
beforeEach(() => query.mockReset());
it('does not query when no eligible source needs a frozen identity', async () => {
  expect((await dailySourceAudit([], false)).size).toBe(0);
  expect(query).not.toHaveBeenCalled();
});
it('uses one parameterized batch, projects JSON fields, and preserves missing data', async () => {
  query.mockResolvedValue([{ fixtureId: 1, capturedAt: null, competition: null, performancePressure: null }]);
  const rows = await dailySourceAudit([1, 1, 2], false);
  expect(query).toHaveBeenCalledTimes(1);
  const [sql, enabled, ids] = query.mock.calls[0];
  expect(sql.join('')).toContain('"inputSnapshot"->>');
  expect(sql.join('')).not.toContain('SELECT *');
  expect(enabled).toBe(false);
  expect(ids.values).toEqual([1, 2]);
  expect(rows.get(1)?.capturedAt).toBeNull();
});
