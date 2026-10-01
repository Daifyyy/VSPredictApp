import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const find = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ prisma: { apiCache: { findUnique: find } } }));
import { readOperationsReport } from './operationsReport';
it('returns explicit missing state with only one cache read and no audit write', async () => {
  find.mockResolvedValue(null);
  const result = await readOperationsReport();
  expect(result).toEqual({ report: null, asOf: null, stale: true, limitedReason: 'AUDIT_NOT_CAPTURED' });
  expect(find).toHaveBeenCalledTimes(1);
});
