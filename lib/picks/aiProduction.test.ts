import { describe, expect, it } from 'vitest';
import artifact from './artifacts/baseOverResearchV1.json';
import parity from './artifacts/baseOverParityV1.json';
import { inferAI, type AIModelArtifact, type AIMatch } from './aiResearch';
import { AIFreshFeatureBuilder } from './aiFeatureQuality';
import { AI_FEATURE_GROUPS } from './aiFeatures';
import { buildAIBaseForecasts, type AIProductionFixture } from './aiProduction';
describe('manual BASE research runtime', () => {
  it('agrees with Python on fixed real and missing feature vectors', () => {
    for (let i = 0; i < parity.cases.length; i++) {
      expect(inferAI(artifact as AIModelArtifact, parity.cases[i], { manualResearch: true })[0]).toBeCloseTo(parity.probabilities[i], 8);
    }
    expect(() => inferAI(artifact as AIModelArtifact, parity.cases[0])).toThrow();
    expect(() => inferAI(artifact as AIModelArtifact, parity.cases[0], { parityOnly: true })).toThrow();
  });
  it('compacted BASE checkpoint preserves exact selected features and does not mutate its seed', () => {
    const b = new AIFreshFeatureBuilder();
    for (let i = 1; i <= 15; i++) b.ingest({ fixtureId: i, leagueId: 39, season: 2026, homeId: 1, awayId: 2,
      date: `2026-09-${String(i).padStart(2, '0')}T12:00:00Z`, homeGoals: i % 4, awayGoals: i % 3 } satisfies AIMatch);
    const state = b.checkpoint(); for (const [, profile] of state.legacy.profiles) profile.queue = [];
    const before = JSON.stringify(state), restored = AIFreshFeatureBuilder.restore(state);
    const target = { leagueId: 39, season: 2026, homeId: 1, awayId: 2, date: '2026-09-20T18:00:00Z' };
    const a = b.predict(target), c = restored.predict(target);
    expect(c.values.filter((_, i) => AI_FEATURE_GROUPS[i] === 1)).toEqual(a.values.filter((_, i) => AI_FEATURE_GROUPS[i] === 1));
    expect(c.coreCoverage).toBe(a.coreCoverage); expect(JSON.stringify(state)).toBe(before);
  });
  it('fails closed for unsupported scope, no historical schedule or duplicate history', () => {
    const f: AIProductionFixture = { fixtureId: 123, leagueId: 39, season: 2026, homeTeamId: 1, awayTeamId: 2,
      kickoff: new Date('2026-10-24T15:00:00Z'), status: 'NS', homeGoals: null, awayGoals: null, available: true, modelContext: 'LEAGUE' };
    expect(buildAIBaseForecasts([], [f], new Date('2026-10-23')).output).toEqual([]);
    expect(() => buildAIBaseForecasts([f, f], [f], new Date('2026-10-23'))).toThrow('AI_DUPLICATE_HISTORY');
  });
});
