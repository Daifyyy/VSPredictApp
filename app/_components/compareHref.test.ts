import { expect, it } from 'vitest';
import { buildCompareHref } from './compareHref';
const base = { compareMode: 'CLUB' as const, home: { id: 10 }, away: { id: 20 }, homeCompareLeagueId: null, awayCompareLeagueId: null };
it('links by fixture identity without requiring league or team metadata', () => {
 expect(buildCompareHref({ ...base, fixtureId: 42, europeanCup: true })).toBe('/zapas/42');
});
it('never guesses a fixture from two teams', () => { expect(buildCompareHref(base)).toBeNull(); });
it.each([0, -1, NaN, 1.5, Infinity])('rejects invalid fixture identity %s', id => {
 expect(buildCompareHref({ ...base, fixtureId: id })).toBeNull();
});
