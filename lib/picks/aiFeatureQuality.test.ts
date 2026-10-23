import { describe, it, expect } from 'vitest';
import { AIFreshFeatureBuilder, AI_FEATURE_QUALITY_POLICY, aiFeatureView } from './aiFeatureQuality';
import { AI_FEATURE_NAMES } from './aiFeatures';
import type { AIMatch } from './aiResearch';

const stats = { XG: 1.2, SHOTS: 10, SHOTS_ON_TARGET: 4, SHOTS_INSIDE_BOX: 6, CORNERS: 5 };
function match(id: number, day: number, season = 2025): AIMatch {
  return { fixtureId: id, leagueId: 39, season, date: new Date(Date.UTC(2026, 0, day, 12)).toISOString(),
    homeId: 1, awayId: 2, homeGoals: 1, awayGoals: 2, homeMetrics: stats, awayMetrics: stats };
}
function history() { const b = new AIFreshFeatureBuilder(); for (let i = 1; i <= 5; i++) b.ingest(match(i, i)); return b; }
function feature(p: ReturnType<AIFreshFeatureBuilder['predict']>, key: string) { return p.values[AI_FEATURE_NAMES.indexOf(key)]; }

describe('AI feature quality v2', () => {
  it('requires five observations for complete advanced profile', () => {
    const p = history().predict(match(99, 7));
    expect(p.profileMode).toBe('ADVANCED');
    expect(p.metricQuality['home.own.XG']).toMatchObject({ usable: true, observations: 5, currentSeasonObservations: 5, ageDays: 1.5 });
    expect(p.featureSchemaVersion).toBe(2);
    expect(feature(p, 'home.xgPerShot')).not.toBeNull();
  });
  it('does not refresh stale xG when a goals-only result arrives', () => {
    const b = history(); b.ingest({ ...match(6, 75), homeMetrics: undefined, awayMetrics: undefined });
    const p = b.predict(match(99, 77));
    expect(p.profileMode).toBe('BASE');
    expect(p.metricQuality['home.own.GOALS'].fresh).toBe(true);
    expect(p.metricQuality['home.own.XG']).toMatchObject({ state: 'STALE', observations: 5, lastObservedAt: match(5, 5).date });
    for (const k of ['home.own.XG', 'home.xgPerShot', 'home.XG.L10', 'home.tempo']) expect(feature(p, k)).toBeNull();
    expect(p.freshCoverage).toBeLessThan(p.availableCoverage);
    expect(feature(p, 'home.xgPerShot.missing')).toBe(1);
  });
  it('one new xG after a gap cannot turn an expired history into a mature profile', () => {
    const b = history(); b.ingest(match(6, 200));
    const p = b.predict(match(99, 202));
    expect(p.profileMode).toBe('UNAVAILABLE');
    expect(p.metricQuality['home.own.XG']).toMatchObject({ fresh: true, usable: false, state: 'SMALL_SAMPLE', recentObservations: 1, observations: 6 });
  });
  it('isolates current-season readiness even when preceding season is fresh', () => {
    const b = history(), p = b.predict(match(99, 7, 2026));
    expect(p.profileMode).toBe('BASE');
    expect(p.metricQuality['home.own.XG']).toMatchObject({ state: 'SEASON_WARMUP', lastSeason: 2025, currentSeasonObservations: 0, fresh: true });
    for (let i = 6; i <= 10; i++) b.ingest(match(i, i + 2, 2026));
    expect(b.predict(match(100, 14, 2026)).profileMode).toBe('ADVANCED');
  });
  it('has an exact max-age boundary and never optimistically fills missing data', () => {
    const b = new AIFreshFeatureBuilder();
    for (let i = 1; i <= 5; i++) b.ingest({ ...match(i, i), date: match(i, i).date.replace('12:00', '00:00') });
    const last = Date.parse(match(5, 5).date.replace('12:00', '00:00'));
    expect(b.predict({ ...match(99, 1), date: new Date(last + 45 * 86400000).toISOString() }).metricQuality['home.own.XG'].fresh).toBe(true);
    expect(b.predict({ ...match(99, 1), date: new Date(last + 46 * 86400000).toISOString() }).metricQuality['home.own.XG'].fresh).toBe(false);
    const empty = new AIFreshFeatureBuilder().predict(match(99, 7));
    expect(empty.profileMode).toBe('UNAVAILABLE');
    expect(empty.metricQuality['away.allowed.XG']).toMatchObject({ state: 'MISSING', ageDays: null, observations: 0 });
  });
  it('tracks own and opponent-allowed completeness separately', () => {
    const b = new AIFreshFeatureBuilder();
    for (let i = 1; i <= 5; i++) b.ingest({ ...match(i, i), awayMetrics: { ...stats, XG: NaN } });
    const p = b.predict(match(99, 7));
    expect(p.profileMode).toBe('BASE');
    expect(p.metricQuality['home.own.XG'].usable).toBe(true);
    expect(p.metricQuality['home.allowed.XG'].state).toBe('MISSING');
    expect(p.metricQuality['away.own.XG'].state).toBe('MISSING');
  });
  it('rejects impossible shot relationships before counting observations', () => {
    const b = new AIFreshFeatureBuilder();
    for (let i = 1; i <= 5; i++) b.ingest({ ...match(i, i), homeMetrics: { ...stats, SHOTS_ON_TARGET: 12 } });
    const p = b.predict(match(99, 7));
    expect(p.metricQuality['home.own.SHOTS_ON_TARGET'].observations).toBe(0);
    expect(feature(p, 'home.sotPerShot')).toBeNull();
  });
  it('retains time-leakage checks and does not mutate previously returned quality', () => {
    const b = history(), p = b.predict(match(99, 7)), before = JSON.stringify(p);
    b.ingest(match(7, 8));
    expect(JSON.stringify(p)).toBe(before);
    expect(() => b.predict(match(99, 7))).toThrow('LEAKAGE');
    expect(() => b.ingest(match(7, 8))).toThrow('DUPLICATE');
  });
  it('bounds team windows while keeping lifetime observation counts explicit', () => {
    const b = new AIFreshFeatureBuilder(); for (let i = 1; i <= 100; i++) b.ingest(match(i, i));
    const q = b.predict(match(101, 102)).metricQuality['home.own.XG'];
    expect(q.observations).toBe(100); expect(q.recentObservations).toBe(AI_FEATURE_QUALITY_POLICY.maxTeamMatches);
  });
  it('keeps the BASE feature vector independent of advanced values', () => {
    const a = history(), b = new AIFreshFeatureBuilder();
    for (let i = 1; i <= 5; i++) b.ingest({ ...match(i, i), homeMetrics: undefined, awayMetrics: undefined });
    const full = a.predict(match(99, 7)), core = b.predict(match(99, 7));
    expect(aiFeatureView(full, 'BASE')).toEqual(aiFeatureView(core, 'BASE'));
    expect(aiFeatureView(core, 'ADVANCED')).toBeNull();
    expect(aiFeatureView(full, 'BASE')?.featureNames.some(n => n.includes('XG'))).toBe(false);
    expect(aiFeatureView(full, 'ADVANCED')?.values).toEqual(full.values);
    expect(aiFeatureView(new AIFreshFeatureBuilder().predict(match(99, 7)), 'BASE')).toBeNull();
  });
  it('validates target identity and normalizes timezone before cutoff', () => {
    const b = history();
    expect(() => b.predict({ ...match(99, 7), date: '2026-01-07-invalid' })).toThrow('INVALID_AI_TARGET');
    expect(() => b.predict({ ...match(99, 7), awayId: 1 })).toThrow('INVALID_AI_TARGET');
    expect(b.predict({ ...match(99, 7), date: '2026-01-07T00:30:00+02:00' }).metricQuality['home.own.XG'].ageDays).toBe(.5);
  });
});
