import { describe, it, expect } from 'vitest';
import { reconcileAIArchive, type AIArchiveRow } from './aiLocalArchive';
const row: AIArchiveRow = { fixtureId: 1, leagueId: 39, season: 2024, homeId: 1, awayId: 2,
  date: '2024-08-16T19:00:00Z', homeGoals: 1, awayGoals: 0 };
const fixture = { fixtureId: 1, homeTeamId: 1, awayTeamId: 2, kickoff: '2024-08-16T21:00:00+02:00',
  homeGoals: 1, awayGoals: 0, status: 'FT', round: 'Regular Season - 1' };
const side = { XG: 0, SHOTS: 5, SHOTS_ON_TARGET: 2, SHOTS_INSIDE_BOX: 3, CORNERS: 0 };
describe('local AI archive reconciliation', () => {
  it('keeps unverified history quarantined despite complete statistics', () => {
    const r = reconcileAIArchive([row], { 1: { home: side, away: side } }, 39, 2024);
    expect(r.completeAdvancedStats).toBe(1); expect(r.reconciled).toBe(0);
    expect(r.reasons.NO_VERIFIED_INVENTORY).toBe(1);
  });
  it('matches UTC instants, allows zeros, never authorizes training', () => {
    const r = reconcileAIArchive([row], { 1: { home: side, away: side } }, 39, 2024, [fixture]);
    expect(r.reconciledWithAdvancedStats).toBe(1);
    expect(r.classified[0].trainingAllowed).toBe(false);
  });
  it('quarantines all copies of a duplicate', () => {
    const r = reconcileAIArchive([row, row], {}, 39, 2024, [fixture]);
    expect(r.reconciled).toBe(0); expect(r.reasons.DUPLICATE_FIXTURE).toBe(2);
  });
  it('detects score, identity, scope and FT conflicts independently', () => {
    const r = reconcileAIArchive([row], {}, 78, 2025, [{ ...fixture, status: 'AET', homeGoals: 2, awayTeamId: 3 }]);
    expect(r.classified[0].reasons).toEqual(['SOURCE_SCOPE_MISMATCH', 'IDENTITY_CONFLICT', 'RESULT_CONFLICT', 'NOT_REGULAR_FT']);
  });
  it('does not accept impossible statistics or count orphan joins', () => {
    const r = reconcileAIArchive([row], { 1: { home: { ...side, SHOTS_ON_TARGET: 6 }, away: side }, 2: { home: side } }, 39, 2024, [fixture]);
    expect(r.completeAdvancedStats).toBe(0); expect(r.orphanStats).toBe(1);
  });
  it('reports missing archive fixtures separately from successful matches', () => {
    const r = reconcileAIArchive([row], {}, 39, 2024, [fixture, { ...fixture, fixtureId: 2 }]);
    expect(r.reconciled).toBe(1); expect(r.inventoryOnlyRegularFT).toEqual([2]);
  });
});
