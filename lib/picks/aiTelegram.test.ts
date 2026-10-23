import { describe, it, expect } from 'vitest';
import { aiTipPicks, formatAITips, formatAIResults } from './aiTelegram';
import type { AIResearchDay } from '../data/aiResearchStore';
const now = new Date('2026-10-24T07:00:00Z');
const day: AIResearchDay = { version: 1, date: '2026-10-24', asOf: now.toISOString(), artifactId: 'x', research: true, forecasts: [], rejected: [],
  picks: [1,2,3,4].map(i => ({ id: String(i), fixtureId: i, homeName: 'A < B', awayName: 'C', kickoff: '2026-10-24T12:00:00Z', probability: .61,
    odds: 1.9, bookmaker: 'Book', quotedAt: now.toISOString(), outcome: 'PENDING', profit: null, priceClv: null, currentEligible: true })) };
describe('AI Telegram projection', () => {
  it('accepts a freshly reverified identical price without replacing its accounting timestamp', () => {
    const pick = { ...day.picks[0], quotedAt: '2026-10-23T12:00:00Z', verifiedAt: now.toISOString() };
    expect(aiTipPicks({ ...day, picks: [pick] }, now)).toEqual([pick]);
    expect(pick.quotedAt).toBe('2026-10-23T12:00:00Z');
    expect(aiTipPicks({ ...day, picks: [{ ...pick, verifiedAt: '2026-10-24T08:00:00Z' }] }, now)).toEqual([]);
  });
  it('uses at most three stored eligible picks, labelled experimental and escaped', () => {
    expect(aiTipPicks(day, now)).toHaveLength(3);
    const text = formatAITips(day, now).join('\n'); expect(text).toContain('neověřená'); expect(text).toContain('A &lt; B');
  });
  it('does not recommend expired, started, settled or currently rejected selections', () => {
    for (const changed of [{ quotedAt: '2026-10-24T05:29:00Z' }, { currentEligible: false }, { outcome: 'LOST' }, { kickoff: now.toISOString() }]) {
      expect(aiTipPicks({ ...day, picks: day.picks.map(p => ({ ...p, ...changed })) }, now)).toHaveLength(0);
    }
    expect(aiTipPicks({ ...day, asOf: '2026-10-23T00:00:00Z' }, now)).toHaveLength(0);
  });
  it('distinguishes missing data from no qualified bet and retains rejected past outcomes', () => {
    expect(formatAITips(null, now).join(' ')).toContain('nejsou dostupné');
    expect(formatAITips({ ...day, picks: [] }, now).join(' ')).toContain('Žádný aktuální');
    expect(formatAIResults({ ...day, picks: [{ ...day.picks[0], currentEligible: false, outcome: 'LOST', profit: -1 }] }).join(' ')).toContain('❌');
  });
});
