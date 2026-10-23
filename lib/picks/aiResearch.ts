/** Versioned research contracts. Never change the main model or existing selections. */
export type AIMarket = 'ONE_X_TWO' | 'OVER_25';
export type AIVector = [number, number, number];
export const AI_PROTOCOL = {
  version: 1, seed: 20261023, maxFits: 80, maxSeconds: 5400, threads: 2,
  maxRssBytes: 4 * 1024 ** 3, minFreeBytes: 2 * 1024 ** 3, maxCacheBytes: 1024 ** 3,
  minTrain: 1000, minCalibration: 200, minTerminal: 200,
  ablationGain: .005, minimumGain: .01, segmentMaxLoss: .02, segmentMinN: 100, maxEce: .05,
  maxArtifactBytes: 1_000_000, policyVersion: 1,
} as const;
export interface AIMatch {
  fixtureId: number; leagueId: number; season: number; date: string; homeId: number; awayId: number;
  homeGoals: number; awayGoals: number; homeMetrics?: Record<string, number>; awayMetrics?: Record<string, number>;
}
export interface AIFeatureRow {
  fixtureId: number; leagueId: number; day: string; kickoff: string; values: Array<number | null>;
  coverage: number; homeSample: number; awaySample: number; latestHistory: string | null;
  outcome: number; over: number; baseline: { oneXTwo: AIVector; over: number }; leagueBaseline: { oneXTwo: AIVector; over: number };
}
export interface AIModelArtifact {
  version: 1; market: AIMarket; featureNames: string[]; selectedFeatures: number[];
  impute: number[]; scale: number[]; offset: number[]; temperature: number;
  kind: 'LOGISTIC' | 'CATBOOST_NUMERIC'; coefficients?: number[][]; intercept?: number[];
  trees?: Array<{ splits: Array<{ feature: number; border: number }>; leaves: number[][] }>;
  bias?: number[]; multiplier?: number;
  datasetHash: string; protocolHash: string; status: 'SHADOW_APPROVED' | 'RESEARCH_CANDIDATE';
}
export function aiFlags() {
  return { inference: process.env.AI_RESEARCH_INFERENCE_ENABLED === 'true', ui: process.env.AI_RESEARCH_UI_ENABLED === 'true',
    opportunities: process.env.AI_RESEARCH_OPPORTUNITIES_ENABLED === 'true', telegram: process.env.AI_RESEARCH_TELEGRAM_ENABLED === 'true' };
}

const softmax = (z: number[]) => { const mx = Math.max(...z), e = z.map(x => Math.exp(x - mx)), sum = e.reduce((a, b) => a + b, 0); return e.map(x => x / sum); };
/** Compact numeric-only runtime. No fitting, filesystem, Python or database access. */
export function inferAI(a: AIModelArtifact, values: Array<number | null>, options?: { parityOnly: true }) {
  if (a.version !== 1 || !(a.status === 'SHADOW_APPROVED' || options?.parityOnly && a.status === 'RESEARCH_CANDIDATE') || !['ONE_X_TWO', 'OVER_25'].includes(a.market)
    || !Number.isFinite(a.temperature) || a.temperature <= 0 || values.length !== a.featureNames.length) throw Error('INVALID_AI_ARTIFACT');
  const x = a.selectedFeatures.map((index, i) => {
    if (!Number.isInteger(index) || index < 0 || index >= values.length || !Number.isFinite(a.impute[i])) throw Error('INVALID_AI_FEATURE');
    const value = values[index] ?? a.impute[i];
    if (!Number.isFinite(value)) throw Error('NONFINITE_AI_INPUT');
    return value;
  });
  const classes = a.market === 'ONE_X_TWO' ? 3 : 1;
  let logits: number[];
  if (a.kind === 'LOGISTIC') {
    if (a.scale.length !== x.length || a.offset.length !== x.length || a.scale.some(s => !Number.isFinite(s) || s <= 0)) throw Error('INVALID_AI_SCALE');
    if (a.coefficients?.length !== classes || a.intercept?.length !== classes) throw Error('INVALID_AI_LINEAR');
    logits = a.coefficients.map((w, c) => {
      if (w.length !== x.length) throw Error('INVALID_AI_LINEAR');
      return w.reduce((s, weight, i) => s + weight * ((x[i] - a.offset[i]) / a.scale[i]), a.intercept![c]);
    });
  } else if (a.kind === 'CATBOOST_NUMERIC') {
    if (!a.trees || a.trees.length > 600 || a.bias?.length !== classes || !Number.isFinite(a.multiplier)) throw Error('INVALID_AI_TREES');
    logits = [...a.bias];
    for (const tree of a.trees) {
      if (tree.splits.length > 6 || tree.leaves.length !== 2 ** tree.splits.length) throw Error('INVALID_AI_TREE');
      let leaf = 0;
      tree.splits.forEach((s, i) => {
        if (!Number.isInteger(s.feature) || s.feature < 0 || s.feature >= x.length || !Number.isFinite(s.border)) throw Error('UNSUPPORTED_AI_SPLIT');
        if (x[s.feature] > s.border) leaf |= 1 << i;
      });
      if (tree.leaves[leaf].length !== classes) throw Error('INVALID_AI_LEAF');
      logits = logits.map((z, c) => z + a.multiplier! * tree.leaves[leaf][c]);
    }
  } else throw Error('UNSUPPORTED_AI_MODEL');
  if (logits.some(x => !Number.isFinite(x))) throw Error('NONFINITE_AI_OUTPUT');
  const z = logits.map(x => x / a.temperature);
  return classes === 3 ? softmax(z) : [1 / (1 + Math.exp(-z[0]))];
}

export interface AIQuote { side: 'HOME' | 'DRAW' | 'AWAY' | 'OVER'; odds: number; fairProbability: number; bookmaker: string; quotedAt: string; direct: boolean; complete: boolean }
export function selectAI(market: AIMarket, probabilities: number[], profile: { coverage: number; homeSample: number; awaySample: number; severeWarning: boolean }, quotes: AIQuote[], kickoff: Date, now: Date) {
  if (![+kickoff, +now, profile.coverage, profile.homeSample, profile.awaySample].every(Number.isFinite)
    || profile.coverage > 1 || profile.severeWarning || profile.coverage < .75 || Math.min(profile.homeSample, profile.awaySample) < 5 || +kickoff - +now < 30 * 60000) return null;
  if (probabilities.length !== (market === 'ONE_X_TWO' ? 3 : 1) || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)
    || market === 'ONE_X_TWO' && Math.abs(probabilities.reduce((s, p) => s + p, 0) - 1) > 1e-6) return null;
  const sides = market === 'ONE_X_TWO' ? ['HOME', 'DRAW', 'AWAY'] : ['OVER'];
  const eligible = quotes.flatMap(q => {
    const index = sides.indexOf(q.side), age = +now - Date.parse(q.quotedAt), p = probabilities[index];
    if (index < 0 || !q.direct || !q.complete || !q.bookmaker || !Number.isFinite(age) || age < 0 || age > 90 * 60000
      || !Number.isFinite(q.odds) || q.odds < 1.5 || q.odds > 3 || !Number.isFinite(q.fairProbability) || q.fairProbability <= 0 || q.fairProbability >= 1
      || p < .55 || p - q.fairProbability < .04 - 1e-12 || p * q.odds - 1 < .03 - 1e-12) return [];
    return [{ ...q, probability: p, edge: p - q.fairProbability, ev: p * q.odds - 1, index }];
  });
  return eligible.sort((a, b) => b.probability - a.probability || a.index - b.index || b.odds - a.odds || a.bookmaker.localeCompare(b.bookmaker))[0] ?? null;
}
