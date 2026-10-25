import { describe, it, expect } from 'vitest';
import { ticketBreakdown, combinationConditions } from './ticketPresentation';
import type { StrategyHubOpportunity, StrategyHubTicket } from '../data/strategyHubStore';

const leg = { id: 'a', fixtureId: 1, homeName: 'Home', awayName: 'Away', outcome: 'LOST', ticketSlots: [1],
  combination: { winner: 'HOME', total: 'OVER', line: 1.5, homeGoals: 1, awayGoals: 0 } } as StrategyHubOpportunity;
const ticket = { slot: 1, fixtureIds: [1] } as StrategyHubTicket;
describe('shared ticket breakdown', () => {
  it('distinguishes correct winner from failed goals condition', () => {
    expect(combinationConditions(leg).map(c => c.outcome)).toEqual(['WON', 'LOST']);
  });
  it('prefers own exact legs rather than another selection on the same fixture', () => {
    const own = { ...leg, id: 'other', combination: { ...leg.combination!, total: 'UNDER' } };
    expect(ticketBreakdown({ ...ticket, legs: [own] }, [leg])[0].leg?.id).toBe('other');
    expect(ticketBreakdown(ticket, [{ ...leg, ticketSlots: [2] }])[0].leg).toBeNull();
    expect(ticketBreakdown(ticket, [leg, own])[0].leg).toBeNull();
  });
  it('does not settle live scores, missing goals or voids as losses', () => {
    expect(combinationConditions({ ...leg, outcome: 'PENDING' }).map(c => c.outcome)).toEqual(['PENDING', 'PENDING']);
    expect(combinationConditions({ ...leg, combination: { ...leg.combination!, homeGoals: null } }).map(c => c.outcome)).toEqual(['PENDING', 'PENDING']);
    expect(combinationConditions({ ...leg, outcome: 'VOID' }).map(c => c.outcome)).toEqual(['VOID', 'VOID']);
    expect(combinationConditions({ ...leg, combination: undefined })).toEqual([]);
  });
});
