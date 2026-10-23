import { expect, it } from 'vitest';
import { inventoryQuota, parseAIInventory } from './aiInventoryImport';
const row = { fixture: { id: 1, date: '2024-08-01T19:00:00Z', status: { short: 'FT' } },
  league: { id: 39, season: 2024, round: 'Regular Season - 1' }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 1, away: 0 } };
const body = () => ({ errors: [], paging: { current: 1, total: 1 }, results: 1, response: [structuredClone(row)] });
it('reserves provider capacity and rejects unknown quota', () => {
  expect(inventoryQuota(5620,7500,5).allowed).toBe(true);
  expect(inventoryQuota(5621,7500,5).allowed).toBe(false);
  expect(inventoryQuota(71,100,5).allowed).toBe(false);
  expect(() => inventoryQuota(NaN,7500,5)).toThrow();
});
it('accepts only complete single-page scoped fixtures', () => {
  expect(parseAIInventory(body(),39).fixtures[0].homeGoals).toBe(1);
  const b=body(); b.paging.total=2;
  expect(() => parseAIInventory(b,39)).toThrow();
  expect(() => parseAIInventory(body(),94)).toThrow();
});
it('rejects duplicate and wrong-season identities', () => {
  const b=body(); b.response.push(structuredClone(row)); b.results=2;
  expect(() => parseAIInventory(b,39)).toThrow();
  const c=body(); c.response[0].league.season=2025;
  expect(() => parseAIInventory(c,39)).toThrow();
});
it('never substitutes extra-time goals for missing 90-minute result', () => {
  const b=body(); b.response[0].fixture.status.short='AET';
  expect(parseAIInventory(b,39).fixtures[0].homeGoals).toBeNull();
});
