import { describe, expect, it } from 'vitest';
import { AIFeatureBuilder, AI_FEATURE_NAMES } from './aiFeatures';
import { aiFlags, inferAI, selectAI, type AIModelArtifact, type AIMatch, type AIQuote } from './aiResearch';

const match = (id = 1, date = '2025-01-01T12:00:00Z'): AIMatch => ({ fixtureId: id, leagueId: 39, season: 2024, date, homeId: 1, awayId: 2, homeGoals: 2, awayGoals: 1 });
const target = match(100, '2025-02-01T18:00:00Z');
const value = (xs: Array<number | null>, name: string) => xs[AI_FEATURE_NAMES.indexOf(name)];
const artifact = (): AIModelArtifact => ({ version: 1, market: 'OVER_25', kind: 'LOGISTIC', status: 'SHADOW_APPROVED', featureNames: ['a'], selectedFeatures: [0],
  impute: [2], scale: [2], offset: [1], coefficients: [[2]], intercept: [0], temperature: 1, datasetHash: 'test', protocolHash: 'test' });
const now = new Date('2026-10-23T09:00:00Z'), kickoff = new Date('2026-10-23T09:30:00Z');
const profile = { coverage: .75, homeSample: 5, awaySample: 5, severeWarning: false };
const quote: AIQuote = { side: 'OVER', odds: 2, fairProbability: .51, bookmaker: 'Allowed', quotedAt: '2026-10-23T07:30:00Z', direct: true, complete: true };

describe('AI point-in-time features', () => {
  it('does not manufacture quality when xG is missing', () => {
    const b = new AIFeatureBuilder(); b.ingest(match());
    const p = b.predict(target);
    expect(p.values.length).toBe(AI_FEATURE_NAMES.length);
    expect(value(p.values, 'home.xgPerShot')).toBeNull();
    expect(value(p.values, 'home.xgPerShot.missing')).toBe(1);
    expect(p.coverage).toBeLessThan(1);
  });
  it('uses past own and allowed volume, effective sample, league and venue', () => {
    const b = new AIFeatureBuilder();
    b.ingest({ ...match(), homeMetrics: { SHOTS: 10, XG: 1, SHOTS_ON_TARGET: 4 }, awayMetrics: { SHOTS: 6 } });
    b.ingest({ ...match(2, '2025-01-08T12:00:00Z'), homeGoals: 0, awayGoals: 0 });
    const p = b.predict(target);
    expect(value(p.values, 'home.own.SHOTS')).toBe(10);
    expect(value(p.values, 'home.allowed.SHOTS')).toBe(6);
    expect(value(p.values, 'home.xgPerShot')).toBe(.1);
    expect(value(p.values, 'home.effectiveSample')).toBeGreaterThan(1.9);
    expect(value(p.values, 'home.effectiveSample')).toBeLessThanOrEqual(2);
    expect(value(p.values, 'leagueHomeGoals')).toBe(1);
    expect(value(p.values, 'home.venueAttack')).toBe(1);
  });
  it('rejects same-day and exact three-hour boundary', () => {
    for (const date of ['2025-02-01T10:00:00Z', '2025-01-31T21:00:00Z']) {
      const b = new AIFeatureBuilder(); b.ingest(match(1, date));
      expect(() => b.predict(target)).toThrow('LEAKAGE');
    }
    const b = new AIFeatureBuilder(); b.ingest(match(1, '2025-01-31T20:59:59Z'));
    expect(b.predict(target).homeSample).toBe(1);
  });
  it('target results and later outcomes cannot alter existing features', () => {
    const b = new AIFeatureBuilder(); b.ingest(match());
    const p = b.predict(target);
    expect(b.predict({ ...target, homeGoals: 99 } as AIMatch)).toEqual(p);
    b.ingest({ ...target, homeGoals: 99 });
    expect(value(p.values, 'home.attack')).toBe(2);
    expect(() => b.predict(target)).toThrow('LEAKAGE');
  });
  it('rejects duplicate, reverse history, invalid identities and goals', () => {
    const b = new AIFeatureBuilder(); b.ingest(match());
    expect(() => b.ingest(match())).toThrow('DUPLICATE');
    expect(() => b.ingest(match(2, '2024-01-01'))).toThrow();
    expect(() => new AIFeatureBuilder().ingest({ ...match(), awayGoals: NaN })).toThrow();
    expect(() => new AIFeatureBuilder().ingest({ ...match(), homeId: 2 })).toThrow();
  });
  it('does not mix leagues or give newcomers historical samples', () => {
    const b = new AIFeatureBuilder(); b.ingest(match());
    expect(b.predict({ ...target, leagueId: 140 }).homeSample).toBe(0);
  });
});

describe('compact numeric AI inference', () => {
  it('matches logistic scaling, imputation and temperature', () => {
    expect(inferAI(artifact(), [null])[0]).toBeCloseTo(1 / (1 + Math.exp(-1)), 12);
    expect(inferAI({ ...artifact(), temperature: 2 }, [3])[0]).toBeCloseTo(1 / (1 + Math.exp(-1)), 12);
  });
  it('refuses unapproved parity candidates in normal inference', () => {
    const a = { ...artifact(), status: 'RESEARCH_CANDIDATE' as const };
    expect(() => inferAI(a, [1])).toThrow();
    expect(inferAI(a, [1], { parityOnly: true })).toEqual([.5]);
  });
  it('supports multiclass softmax without numeric overflow', () => {
    const a = { ...artifact(), market: 'ONE_X_TWO' as const, coefficients: [[0], [0], [0]], intercept: [1000, 1000, 1000] };
    expect(inferAI(a, [1])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
  it('uses strict numeric tree borders and oblivious leaf ordering', () => {
    const a: AIModelArtifact = { ...artifact(), kind: 'CATBOOST_NUMERIC', multiplier: 2, bias: [.1], trees: [{ splits: [{ feature: 0, border: 2 }], leaves: [[0], [1]] }] };
    expect(inferAI(a, [2])[0]).toBeCloseTo(1 / (1 + Math.exp(-.1)), 12);
    expect(inferAI(a, [2.00001])[0]).toBeCloseTo(1 / (1 + Math.exp(-2.1)), 12);
    expect(() => inferAI({ ...a, trees: [{ splits: [{ feature: 2, border: 0 }], leaves: [[0], [1]] }] }, [1])).toThrow();
  });
  it('fails closed on unsupported format, invalid scales and nonfinite inputs', () => {
    expect(() => inferAI({ ...artifact(), kind: 'UNKNOWN' } as unknown as AIModelArtifact, [1])).toThrow();
    expect(() => inferAI({ ...artifact(), scale: [0] }, [1])).toThrow();
    expect(() => inferAI(artifact(), [Infinity])).toThrow();
  });
  it('has all production flags disabled by default', () => {
    expect(aiFlags()).toEqual({ inference: false, ui: false, opportunities: false, telegram: false });
  });
});

describe('fixed AI selector v1', () => {
  it('includes exact p/edge/history/coverage/freshness/kickoff boundaries', () => {
    expect(selectAI('OVER_25', [.55], profile, [quote], kickoff, now)?.probability).toBe(.55);
  });
  it.each([
    { quotedAt: '2026-10-23T07:29:59Z' }, { quotedAt: '2026-10-23T09:00:01Z' }, { quotedAt: 'bad' },
    { direct: false }, { complete: false }, { odds: 1.49 }, { odds: 3.01 }, { bookmaker: '' }, { fairProbability: NaN }, { fairProbability: .52 },
  ])('rejects invalid or nonqualifying price %j', patch => {
    expect(selectAI('OVER_25', [.55], profile, [{ ...quote, ...patch }], kickoff, now)).toBeNull();
  });
  it('does not fill missing quality optimistically', () => {
    for (const patch of [{ coverage: NaN }, { homeSample: 4 }, { severeWarning: true }, { coverage: .74 }])
      expect(selectAI('OVER_25', [.55], { ...profile, ...patch }, [quote], kickoff, now)).toBeNull();
    expect(selectAI('OVER_25', [.55], profile, [quote], new Date('bad'), now)).toBeNull();
    expect(selectAI('OVER_25', [.55], profile, [quote], new Date(+kickoff - 1), now)).toBeNull();
  });
  it('rejects incoherent probabilities and returns at most one deterministic side', () => {
    const quotes = [{ ...quote, side: 'HOME' as const }, { ...quote, side: 'AWAY' as const }];
    expect(selectAI('ONE_X_TWO', [.6, .2, .6], profile, quotes, kickoff, now)).toBeNull();
    expect(selectAI('ONE_X_TWO', [.6, .2, .2], profile, quotes.reverse(), kickoff, now)?.side).toBe('HOME');
  });
});
