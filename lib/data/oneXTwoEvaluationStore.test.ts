import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock('../db', () => ({ prisma: { apiCache: { findUnique: mocks.find } } }));
import { loadOneXTwoEvaluation, ONE_X_TWO_EVALUATION_KEY } from './oneXTwoEvaluationStore';
import { sharedReadCache } from '../boundedCache';
import { evaluateOneXTwoProspective } from '../picks/oneXTwoProspective';
afterEach(() => { vi.clearAllMocks(); sharedReadCache.delete(ONE_X_TWO_EVALUATION_KEY); });
describe('small stored 1X2 report', () => {
  it('reads only one cache entry and shares it without a historical scan', async () => {
    const report = evaluateOneXTwoProspective([], new Date('2026-10-23'));
    mocks.find.mockResolvedValue({ payload: report });
    expect(await loadOneXTwoEvaluation()).toEqual({ ...report, stale: expect.any(Boolean) });
    await loadOneXTwoEvaluation();
    expect(mocks.find).toHaveBeenCalledTimes(1);
    expect(mocks.find).toHaveBeenCalledWith({ where: { key: ONE_X_TWO_EVALUATION_KEY }, select: { payload: true } });
  });
  it('returns absence rather than manufactured zeros', async () => {
    mocks.find.mockResolvedValue(null);
    expect(await loadOneXTwoEvaluation()).toBeNull();
  });
});
