import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({upcoming:vi.fn(),history:vi.fn(),fixtures:vi.fn(),lineups:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{fixturePrediction:{findMany:mocks.upcoming},matchStatCache:{findMany:mocks.history}}}));
vi.mock('./apiFootball',()=>({fetchFixturesByIds:mocks.fixtures,fetchFixtureLineups:mocks.lineups}));
vi.mock('./tactics',()=>({markLineupChecked:vi.fn(),saveFixtureLineups:vi.fn()}));
import { backfillRecentTactics } from './tacticsBackfill';
beforeEach(()=>{vi.clearAllMocks();mocks.upcoming.mockResolvedValue([]);mocks.history.mockResolvedValue([]);});
it('makes no history or provider call without upcoming teams',async()=>{expect((await backfillRecentTactics()).apiCalls).toBe(0);expect(mocks.history).not.toHaveBeenCalled();expect(mocks.fixtures).not.toHaveBeenCalled();});
it('restricts collection to bounded upcoming teams and completed historical results',async()=>{
  mocks.upcoming.mockResolvedValue([{homeTeamId:1,awayTeamId:2},{homeTeamId:2,awayTeamId:3}]);await backfillRecentTactics(200);
  expect(mocks.upcoming.mock.calls[0][0].take).toBe(50);
  const query=mocks.history.mock.calls[0][0];expect(query.take).toBe(30);expect(query.where.teamId.in).toEqual([1,2,3]);expect(query.where.goalsFor).toEqual({not:null});expect(query.where.competitive).toBe(true);
  expect(mocks.fixtures).not.toHaveBeenCalled();
});
