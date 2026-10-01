import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const find = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ prisma: { apiCache: { findMany: find } } }));
import { readResourceBudget } from './resourceBudgetStore';
it('bounds failed quota reads and recovers after the circuit interval', async () => {
  const now = new Date('2026-10-01T12:00:00Z');
  find.mockRejectedValueOnce(new Error('offline'));
  await expect(readResourceBudget(now)).rejects.toThrow('offline');
  await expect(readResourceBudget(new Date(+now + 30_000))).rejects.toThrow('CIRCUIT_OPEN');
  expect(find).toHaveBeenCalledTimes(1);
  find.mockResolvedValueOnce([]);
  expect((await readResourceBudget(new Date(+now + 61_000))).mode).toBe('UNKNOWN');
  expect(find).toHaveBeenCalledTimes(2);
});
