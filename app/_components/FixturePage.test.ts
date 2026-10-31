import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ days: vi.fn(), results: vi.fn(), reviews: vi.fn() }));
vi.mock('@/lib/data/repository', () => ({ getCachedFixturesByDates: m.days, getRecentResults: m.results }));
vi.mock('@/lib/data/resultModelReviews', () => ({ getResultModelReviews: m.reviews, mergeResultModelReviews: (days: unknown) => days }));
vi.mock('@/lib/picks/results', () => ({ mergeTips: (days: unknown) => days }));
vi.mock('./ZapasyApp', () => ({ ZapasyApp: () => null }));
vi.mock('@/lib/logError', () => ({ logError: vi.fn() }));
import { FixturePage } from './FixturePage';
beforeEach(() => { vi.clearAllMocks(); m.days.mockResolvedValue([]); m.results.mockResolvedValue([]); m.reviews.mockResolvedValue(new Map()); });
it('program loads six program dates without history or audit queries', async () => {
  await FixturePage({ mode: 'program' });
  expect(m.days.mock.calls[0][0]).toHaveLength(6);
  expect(m.results).not.toHaveBeenCalled(); expect(m.reviews).not.toHaveBeenCalled();
});
it('results loads historical data independently', async () => {
  await FixturePage({ mode: 'results' });
  expect(m.days.mock.calls[0][0]).toHaveLength(8);
  expect(m.results).toHaveBeenCalledWith(8);
});
it('handles unavailable storage without throwing or generating predictions', async () => {
  m.days.mockRejectedValue(Error('quota'));
  await expect(FixturePage({ mode: 'program' })).resolves.toBeTruthy();
  expect(m.results).not.toHaveBeenCalled();
});
