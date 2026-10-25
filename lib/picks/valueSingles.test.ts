import { describe, expect, it } from 'vitest';
import { valueSinglesView } from './valueSingles';
import type { CurrentTips } from './telegramCurrent';
const now = new Date('2026-10-25T10:00:00Z');
const payload: CurrentTips = { version: 1, date: '2026-10-25', asOf: now.toISOString(), items: [{
  id: 'one', fixtureId: 1, strategy: 'VALUE', marketKey: '["RESULT_TOTAL","HOME_OVER",1.5]',
  homeName: 'Home', awayName: 'Away', selection: 'Home + over 1.5', odds: 1.8, oddsAt: now.toISOString(), bookmaker: 'Other book', kickoff: '2026-10-25T14:00:00Z',
}] };
describe('standalone VALUE presentation', () => {
  it('allows a single qualified candidate without a ticket and never relabels its bookmaker', () => {
    const view = valueSinglesView(payload, payload.date, now);
    expect(view.items).toHaveLength(1); expect(view.items[0].bookmaker).toBe('Other book'); expect(view).not.toHaveProperty('preferredBookmaker');
  });
  it('fails closed for missing, stale, wrong-day, future quotes and started fixtures', () => {
    expect(valueSinglesView(null, payload.date, now).stale).toBe(true);
    expect(valueSinglesView(payload, '2026-10-24', now).items).toEqual([]);
    expect(valueSinglesView({ ...payload, asOf: '2026-10-25T08:00:00Z' }, payload.date, now).stale).toBe(true);
    for (const patch of [{ oddsAt: '2026-10-25T08:00:00Z' }, { oddsAt: '2026-10-25T11:00:00Z' }, { kickoff: now.toISOString() }]) {
      expect(valueSinglesView({ ...payload, items: [{ ...payload.items[0], ...patch }] }, payload.date, now).items).toEqual([]);
    }
  });
});
