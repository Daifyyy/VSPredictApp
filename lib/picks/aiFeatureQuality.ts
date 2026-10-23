import { AIFeatureBuilder, AI_FEATURES, AI_FEATURE_NAMES } from './aiFeatures';
import type { AIMatch } from './aiResearch';

/** Engineering safety policy, fixed before a new replay; NOT tuned for ROI. */
export const AI_FEATURE_QUALITY_POLICY = {
  version: 1, featureSchemaVersion: 2, maxAgeDays: 45, historyDays: 180,
  minObservations: 5, minAdvancedSeasonObservations: 5, maxTeamMatches: 40,
} as const;
const DAY = 86400000;
const METRICS = ['GOALS', 'XG', 'SHOTS', 'SHOTS_ON_TARGET', 'SHOTS_INSIDE_BOX', 'CORNERS'] as const;
type Metric = typeof METRICS[number];
type Direction = 'own' | 'allowed';
type Side = 'home' | 'away';
export type AIMetricState = 'READY' | 'MISSING' | 'STALE' | 'SMALL_SAMPLE' | 'SEASON_WARMUP';
export interface AIMetricQuality {
  available: boolean; fresh: boolean; usable: boolean; state: AIMetricState;
  lastObservedAt: string | null; lastSeason: number | null; ageDays: number | null;
  observations: number; recentObservations: number; currentSeasonObservations: number;
}
type QualityKey = `${Side}.${Direction}.${Metric}`;
type Sample = { time: number; season: number; own: Partial<Record<Metric, number>>; allowed: Partial<Record<Metric, number>> };
type MetricHistory = { count: number; time: number; season: number };
type TeamHistory = { matches: Sample[]; metrics: Map<string, MetricHistory> };
const idx = new Map(AI_FEATURES.map((f, i) => [f.name, i]));

function validMetrics(goals: number, raw?: Record<string, number>): Partial<Record<Metric, number>> {
  const out: Partial<Record<Metric, number>> = { GOALS: goals };
  for (const k of METRICS.slice(1)) {
    const v = raw?.[k];
    if (v != null && Number.isFinite(v) && v >= 0 && (k === 'XG' || Number.isInteger(v))) out[k] = v;
  }
  for (const k of ['SHOTS_ON_TARGET', 'SHOTS_INSIDE_BOX'] as const) {
    if (out[k] != null && out.SHOTS != null && out[k]! > out.SHOTS) delete out[k];
  }
  return out;
}

/** v1 is retained for replay reproducibility. This wrapper is a new, incompatible schema. */
export class AIFreshFeatureBuilder {
  private legacy = new AIFeatureBuilder();
  private teams = new Map<string, TeamHistory>();
  checkpoint() {
    return { version: 2 as const, legacy: this.legacy.checkpoint(), teams: [...this.teams].map(([key, value]) =>
      [key, { ...value, metrics: [...value.metrics] }] as const) };
  }
  static restore(state: ReturnType<AIFreshFeatureBuilder['checkpoint']>) {
    if (state.version !== 2) throw Error('INVALID_AI_CHECKPOINT');
    const copy = structuredClone(state), builder = new AIFreshFeatureBuilder();
    builder.legacy = AIFeatureBuilder.restore(copy.legacy);
    builder.teams = new Map(copy.teams.map(([key, value]) => [key, { ...value, metrics: new Map(value.metrics) }]));
    return builder;
  }
  private key(league: number, team: number) { return `${league}:${team}`; }

  ingest(m: AIMatch) {
    if (!Number.isInteger(m.season) || m.season < 1900) throw Error('INVALID_AI_SEASON');
    const own = validMetrics(m.homeGoals, m.homeMetrics), allowed = validMetrics(m.awayGoals, m.awayMetrics);
    // Legacy validates date, IDs, order, duplicate fixture and goals before our state mutates.
    this.legacy.ingest({ ...m, homeMetrics: own, awayMetrics: allowed });
    const time = Date.parse(m.date);
    for (const [team, a, b] of [[m.homeId, own, allowed], [m.awayId, allowed, own]] as const) {
      const key = this.key(m.leagueId, team), h = this.teams.get(key) ?? { matches: [], metrics: new Map<string, MetricHistory>() };
      h.matches.push({ time, season: m.season, own: a, allowed: b });
      if (h.matches.length > AI_FEATURE_QUALITY_POLICY.maxTeamMatches) h.matches.shift();
      for (const [direction, values] of [['own', a], ['allowed', b]] as const) for (const k of METRICS) {
        if (values[k] == null) continue;
        const metricKey = `${direction}.${k}`;
        h.metrics.set(metricKey, { count: (h.metrics.get(metricKey)?.count ?? 0) + 1, time, season: m.season });
      }
      this.teams.set(key, h);
    }
  }

  predict(m: Pick<AIMatch, 'leagueId' | 'homeId' | 'awayId' | 'date' | 'season'>) {
    if (!Number.isInteger(m.season) || m.season < 1900) throw Error('INVALID_AI_SEASON');
    if (!Number.isFinite(Date.parse(m.date)) || ![m.leagueId, m.homeId, m.awayId].every(id => Number.isInteger(id) && id > 0)
      || m.homeId === m.awayId) throw Error('INVALID_AI_TARGET');
    const normalized = { ...m, date: new Date(m.date).toISOString() };
    const base = this.legacy.predict(normalized), origin = Date.parse(normalized.date.slice(0, 10));
    const policy = AI_FEATURE_QUALITY_POLICY;
    const quality = {} as Record<QualityKey, AIMetricQuality>;
    for (const [side, team] of [['home', m.homeId], ['away', m.awayId]] as const) {
      const h = this.teams.get(this.key(m.leagueId, team));
      for (const direction of ['own', 'allowed'] as const) for (const metric of METRICS) {
        const last = h?.metrics.get(`${direction}.${metric}`);
        const recent = (h?.matches ?? []).filter(s => origin - s.time <= policy.historyDays * DAY && s[direction][metric] != null);
        const current = recent.filter(s => s.season === m.season).length;
        const age = last ? (origin - last.time) / DAY : null;
        const fresh = age != null && age >= 0 && age <= policy.maxAgeDays;
        const state: AIMetricState = !last ? 'MISSING' : !fresh ? 'STALE'
          : recent.length < policy.minObservations ? 'SMALL_SAMPLE'
          : metric !== 'GOALS' && current < policy.minAdvancedSeasonObservations ? 'SEASON_WARMUP' : 'READY';
        quality[`${side}.${direction}.${metric}`] = { available: Boolean(last), fresh, usable: state === 'READY', state,
          lastObservedAt: last ? new Date(last.time).toISOString() : null, lastSeason: last?.season ?? null,
          ageDays: age, observations: last?.count ?? 0, recentObservations: recent.length, currentSeasonObservations: current };
      }
    }
    const raw = base.values.slice(0, AI_FEATURES.length);
    const mask = (name: string, dependencies: QualityKey[]) => {
      const i = idx.get(name); if (i == null) throw Error(`UNKNOWN_AI_QUALITY_FEATURE:${name}`);
      if (dependencies.some(k => !quality[k].usable)) raw[i] = null;
    };
    for (const side of ['home', 'away'] as const) {
      mask(`${side}.attack`, [`${side}.own.GOALS`]); mask(`${side}.defense`, [`${side}.allowed.GOALS`]);
      mask(`${side}.venueAttack`, [`${side}.own.GOALS`]); mask(`${side}.venueDefense`, [`${side}.allowed.GOALS`]);
      mask(`${side}.opponentAdjusted`, [`${side}.own.GOALS`]);
      for (const metric of METRICS) {
        if (metric !== 'GOALS') for (const dir of ['own', 'allowed'] as const) mask(`${side}.${dir}.${metric}`, [`${side}.${dir}.${metric}`]);
        for (const window of ['L5', 'L10', 'trend', 'variance']) mask(`${side}.${metric}.${window}`, [`${side}.own.${metric}`]);
      }
      mask(`${side}.xgPerShot`, [`${side}.own.XG`, `${side}.own.SHOTS`]);
      mask(`${side}.sotPerShot`, [`${side}.own.SHOTS_ON_TARGET`, `${side}.own.SHOTS`]);
      mask(`${side}.boxPerShot`, [`${side}.own.SHOTS_INSIDE_BOX`, `${side}.own.SHOTS`]);
      mask(`${side}.tempo`, [`${side}.own.SHOTS`, `${side}.allowed.SHOTS`]);
    }
    mask('homeAttackAwayDefense', ['home.own.GOALS', 'away.allowed.GOALS']);
    mask('awayAttackHomeDefense', ['away.own.GOALS', 'home.allowed.GOALS']);
    const metrics = Object.entries(quality) as Array<[QualityKey, AIMetricQuality]>;
    const coreReady = metrics.filter(([k]) => k.endsWith('.GOALS')).every(([, q]) => q.usable);
    const advancedReady = metrics.filter(([k]) => !k.endsWith('.GOALS')).every(([, q]) => q.usable);
    const profileMode = !coreReady ? 'UNAVAILABLE' : advancedReady ? 'ADVANCED' : 'BASE';
    const coreIndices = AI_FEATURES.flatMap((f, i) => f.group === 1 ? [i] : []);
    const coreCoverage = coreIndices.filter(i => raw[i] != null).length / coreIndices.length;
    const freshCoverage = raw.filter(v => v != null).length / raw.length;
    return { ...base, values: [...raw, ...raw.map(v => v == null ? 1 : 0)], coverage: freshCoverage,
      featureSchemaVersion: 2 as const, qualityPolicyVersion: policy.version, profileMode,
      sourceTiming: 'MATCH_TIME_PROXY' as const,
      availableCoverage: base.coverage, freshCoverage, coreCoverage, metricQuality: quality,
      // Not a fitted model: the mode-specific feature view cannot be sent to a v1 artifact.
      coreFeatureIndices: [...coreIndices, ...coreIndices.map(i => i + AI_FEATURES.length)],
      warnings: [...new Set(metrics.filter(([, q]) => !q.usable).map(([, q]) => q.state))],
      featureNames: AI_FEATURE_NAMES,
    };
  }
}

/** Explicit model input view. Never silently substitute a BASE vector for an ADVANCED artifact. */
export function aiFeatureView(profile: ReturnType<AIFreshFeatureBuilder['predict']>, mode: 'BASE' | 'ADVANCED') {
  if (profile.profileMode === 'UNAVAILABLE' || mode === 'ADVANCED' && profile.profileMode !== 'ADVANCED') return null;
  const indices = mode === 'BASE' ? profile.coreFeatureIndices : profile.values.map((_, i) => i);
  return { featureSchemaVersion: 2 as const, qualityPolicyVersion: profile.qualityPolicyVersion, mode,
    featureNames: indices.map(i => profile.featureNames[i]), values: indices.map(i => profile.values[i]),
    coverage: mode === 'BASE' ? profile.coreCoverage : profile.freshCoverage };
}
