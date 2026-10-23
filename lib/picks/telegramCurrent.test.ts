import { describe, it, expect, afterEach, vi } from 'vitest';
import { currentTipsProjection, formatCurrentTips, type CurrentTips } from './telegramCurrent';
import type { DailyPublicationCandidate } from '../data/dailySelectionStore';
const now = new Date('2026-10-23T10:00:00Z');
const item: CurrentTips['items'][number] = { id: 'a', fixtureId: 1, strategy: 'OVER_25_LEGACY_SHADOW', marketKey: '["OVER_25","OVER",2.5]', kickoff: '2026-10-23T12:00:00Z', homeName: 'A < B', awayName: 'C', selection: 'Over 2,5', odds: 1.9, oddsAt: now.toISOString(), bookmaker: 'Book' };
const payload = (items = [item]): CurrentTips => ({ version: 1, date: '2026-10-23', asOf: now.toISOString(), items });
afterEach(() => vi.unstubAllEnvs());
describe('stored current Telegram tips', () => {
  it('keeps original Over identity and escapes HTML', () => {
    const text = formatCurrentTips(payload(), now, 'OVER_25').join('\n');
    expect(text).toContain('Původní Over'); expect(text).toContain('A &lt; B'); expect(text).toContain('1.90');
  });
  it('fails closed for missing, future or stale projection', () => {
    for (const value of [null, { ...payload(), asOf: 'bad' }, { ...payload(), asOf: '2026-10-23T10:01:00Z' }, { ...payload(), asOf: '2026-10-23T08:29:59Z' }])
      expect(formatCurrentTips(value, now)).toHaveLength(1);
  });
  it('rejects stale/future quotes and started/near kickoff without changing history', () => {
    for (const changed of [{ oddsAt: '2026-10-23T08:29:59Z' }, { oddsAt: '2026-10-23T10:01:00Z' }, { kickoff: '2026-10-23T09:00:00Z' }, { kickoff: '2026-10-23T10:29:59Z' }]) {
      const p = payload([{ ...item, ...changed }]);
      expect(formatCurrentTips(p, now)).toHaveLength(1); expect(p.items).toHaveLength(1);
    }
    expect(formatCurrentTips(payload([{ ...item, oddsAt: '2026-10-23T08:30:00Z', kickoff: '2026-10-23T10:30:00Z' }]), now)).toHaveLength(2);
  });
  it('deduplicates exact markets but not opposite sides', () => {
    const p = payload([item, { ...item, id: 'b', strategy: 'VALUE' }, { ...item, id: 'c', marketKey: '["OVER_25","UNDER",2.5]' }]);
    expect(formatCurrentTips(p, now)).toHaveLength(3);
    expect(formatCurrentTips(p, now)[1]).toContain('VALUE');
  });
  it('rechecks pause switch at read time', () => {
    vi.stubEnv('STRATEGY_FOCUS_MODE_ENABLED', 'true');
    expect(formatCurrentTips(payload([{ ...item, strategy: 'CORNERS' }]), now)).toHaveLength(1);
  });
  it('projection rejects blocked and synthetic candidates', () => {
    const c = { ...item, qualified: true, currentPriceQualified: true, identityValid: true, blocked: false, priceKind: 'DIRECT' } as DailyPublicationCandidate;
    expect(currentTipsProjection('2026-10-23', [c, { ...c, blocked: true }, { ...c, priceKind: 'SYNTHETIC' }], now).items).toHaveLength(1);
  });
});
