import type { BenchmarkRow } from "./forecastBenchmark";

/** Local reconstructed-data research only. No I/O, production imports or request-time fitting. */
export type Vector = [number, number, number];
export type ResearchMatch = {
  fixtureId: number; leagueId: number; date: string;
  homeTeamId: number; awayTeamId: number; homeGoals: number; awayGoals: number;
};
export const RESEARCH_PROTOCOL = {
  version: 1, activation: "FORBIDDEN_PREVIOUSLY_EXPLORED_PERIOD",
  base: "stabilized100", classOrder: ["HOME", "DRAW", "AWAY"],
  dayBasis: "UTC", completionMarginHours: 3, split: [0.6, 0.2, 0.2],
  minimumRows: [100, 50, 50], minimumDays: [10, 5, 5],
  minimumValidationGain: 0.002, l2: 0.1, iterations: 500, learningRate: 0.15,
  eloInitial: 1500, eloK: 20, eloHomeAdvantage: 60, eloScale: 400,
  bootstrapReplicates: 1000,
} as const;
export const BASELINES = ["hardSwitch20", "stabilized100", "leagueFrequency"] as const;
const CALIBRATION = ["homeAdvantageIntercept", "baseLogHomeAway", "baseLogDrawAway"];
const ELO = ["homeElo", "awayElo", "homeEloMissing", "awayEloMissing"];
const CONTEXT = ["home", "away"].flatMap(side =>
  ["L5Points", "L5GoalDifference", "L10Points", "L10GoalDifference", "rest", "L5Missing", "L10Missing", "restMissing"].map(x => side + x));
export const ABLATIONS = ["base", "calibration", "elo", "recentContext"] as const;
export type Ablation = typeof ABLATIONS[number];
export type ResidualModel = {
  version: 1; ablation: Ablation; featureNames: string[]; weights: number[][];
};
export type FeatureRow = {
  fixtureId: number; leagueId: number; date: string; day: string; outcome: number;
  base: Vector; baselines: Record<string, Vector>; features: number[];
  homeHistory: number; awayHistory: number; latestTrainingKickoff: string | null;
};
const DAY = 86400000, MARGIN = 3 * 3600000;
const bounded = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const utcDay = (s: string) => new Date(s).toISOString().slice(0, 10);
const label = (h: number, a: number) => h > a ? 0 : h === a ? 1 : 2;
const validId = (n: number) => Number.isInteger(n) && n > 0;
const validGoals = (n: number) => Number.isInteger(n) && n >= 0;
function assertVector(p: number[]): asserts p is Vector {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(x => Number.isFinite(x) && x >= 0 && x <= 1) ||
      Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-6) throw Error("INVALID_VECTOR");
}
const logP = (p: number) => Math.log(Math.max(1e-12, p));
function softmax(z: number[]): Vector {
  const max = Math.max(...z), exps = z.map(x => Math.exp(x - max)), sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum) as Vector;
}
function featureNames(ablation: Ablation): string[] {
  if (!ABLATIONS.includes(ablation)) throw Error("INVALID_ABLATION");
  return ablation === "base" ? [] : [...CALIBRATION, ...(ablation !== "calibration" ? ELO : []), ...(ablation === "recentContext" ? CONTEXT : [])];
}
function validateInputs(rows: BenchmarkRow[], history: ResearchMatch[]) {
  const index = new Map<number, ResearchMatch>();
  for (const m of history) {
    if (index.has(m.fixtureId)) throw Error("DUPLICATE_HISTORY_FIXTURE");
    if (![m.fixtureId, m.leagueId, m.homeTeamId, m.awayTeamId].every(validId) || m.homeTeamId === m.awayTeamId ||
        !Number.isFinite(Date.parse(m.date)) || !validGoals(m.homeGoals) || !validGoals(m.awayGoals)) throw Error("INVALID_HISTORY");
    index.set(m.fixtureId, m);
  }
  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.fixtureId)) throw Error("DUPLICATE_FORECAST_FIXTURE");
    seen.add(row.fixtureId);
    if (![row.fixtureId, row.leagueId].every(validId) || !Number.isFinite(Date.parse(row.date)) ||
        !validGoals(row.homeGoals) || !validGoals(row.awayGoals)) throw Error("INVALID_FORECAST_ROW");
    for (const key of BASELINES) assertVector(row.forecasts?.[key]?.oneXTwo ?? []);
    const m = index.get(row.fixtureId);
    if (!m || m.leagueId !== row.leagueId || Date.parse(m.date) !== Date.parse(row.date) ||
        m.homeGoals !== row.homeGoals || m.awayGoals !== row.awayGoals) throw Error("FORECAST_HISTORY_MISMATCH");
  }
  return index;
}

/** Elo updates are simultaneous within kickoff groups and isolated by league. */
function eloRatings(history: ResearchMatch[]) {
  const ratings = new Map<number, number>();
  for (let start = 0; start < history.length;) {
    let end = start + 1;
    while (end < history.length && Date.parse(history[end].date) === Date.parse(history[start].date)) end++;
    const updates = new Map<number, number>();
    for (const m of history.slice(start, end)) {
      const h = ratings.get(m.homeTeamId) ?? 1500, a = ratings.get(m.awayTeamId) ?? 1500;
      const expected = 1 / (1 + 10 ** ((a - h - RESEARCH_PROTOCOL.eloHomeAdvantage) / 400));
      const observed = m.homeGoals > m.awayGoals ? 1 : m.homeGoals === m.awayGoals ? 0.5 : 0;
      const delta = RESEARCH_PROTOCOL.eloK * (observed - expected);
      updates.set(m.homeTeamId, (updates.get(m.homeTeamId) ?? 0) + delta);
      updates.set(m.awayTeamId, (updates.get(m.awayTeamId) ?? 0) - delta);
    }
    for (const [team, delta] of updates) ratings.set(team, (ratings.get(team) ?? 1500) + delta);
    start = end;
  }
  return ratings;
}
function recentFeatures(history: ResearchMatch[], teamId: number, origin: number) {
  const team = history.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId).reverse();
  const form = (n: number) => {
    const matches = team.slice(0, n);
    if (!matches.length) return [0, 0];
    const totals = matches.reduce((s, m) => {
      const gf = m.homeTeamId === teamId ? m.homeGoals : m.awayGoals;
      const ga = m.homeTeamId === teamId ? m.awayGoals : m.homeGoals;
      return [s[0] + (gf > ga ? 3 : gf === ga ? 1 : 0), s[1] + gf - ga];
    }, [0, 0]);
    return [totals[0] / matches.length / 3, bounded(totals[1] / matches.length / 3, -1, 1)];
  };
  return { count: team.length, values: [...form(5), ...form(10),
    team.length ? bounded((origin - Date.parse(team[0].date)) / DAY, 0, 30) / 30 : 0,
    Number(team.length < 5), Number(team.length < 10), Number(!team.length)] };
}

/** Only previous UTC days, with kickoff + 3h strictly before origin. No target-day scores. */
export function buildResearchFeatures(rows: BenchmarkRow[], history: ResearchMatch[]): FeatureRow[] {
  const index = validateInputs(rows, history);
  const sorted = [...history].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.fixtureId - b.fixtureId);
  const cache = new Map<string, { train: ResearchMatch[]; ratings: Map<number, number> }>();
  return [...rows].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.fixtureId - b.fixtureId).map(row => {
    const day = utcDay(row.date), origin = Date.parse(day), key = `${row.leagueId}:${day}`;
    let state = cache.get(key);
    if (!state) {
      const train = sorted.filter(m => m.leagueId === row.leagueId && Date.parse(m.date) + MARGIN < origin);
      state = { train, ratings: eloRatings(train) }; cache.set(key, state);
    }
    const m = index.get(row.fixtureId)!, base = [...row.forecasts.stabilized100.oneXTwo] as Vector;
    const h = recentFeatures(state.train, m.homeTeamId, origin), a = recentFeatures(state.train, m.awayTeamId, origin);
    const elo = (id: number) => bounded(((state.ratings.get(id) ?? 1500) - 1500) / 400, -2, 2);
    const features = [1, bounded(logP(base[0]) - logP(base[2]), -6, 6) / 3,
      bounded(logP(base[1]) - logP(base[2]), -6, 6) / 3,
      elo(m.homeTeamId), elo(m.awayTeamId), Number(!state.ratings.has(m.homeTeamId)), Number(!state.ratings.has(m.awayTeamId)),
      ...h.values, ...a.values];
    return { fixtureId: row.fixtureId, leagueId: row.leagueId, date: new Date(row.date).toISOString(), day,
      outcome: label(row.homeGoals, row.awayGoals), base, features,
      baselines: Object.fromEntries(BASELINES.map(k => [k, [...row.forecasts[k].oneXTwo] as Vector])),
      homeHistory: h.count, awayHistory: a.count, latestTrainingKickoff: state.train.at(-1)?.date ?? null };
  });
}
export function researchDaySplit<T extends { day: string }>(rows: T[]) {
  const days = [...new Set(rows.map(r => r.day))].sort(), a = Math.floor(days.length * .6), b = Math.floor(days.length * .8);
  const trainDays = new Set(days.slice(0, a)), validationDays = new Set(days.slice(a, b));
  return { train: rows.filter(r => trainDays.has(r.day)), validation: rows.filter(r => validationDays.has(r.day)),
    terminal: rows.filter(r => !trainDays.has(r.day) && !validationDays.has(r.day)) };
}
function identityModel(): ResidualModel { return { version: 1, ablation: "base", featureNames: [], weights: [[], [], []] }; }

/** Pure inference: p' = softmax(log(base) + W*x). Never fits, loads, or activates anything. */
export function inferOneXTwo(model: ResidualModel, base: Vector, features: number[]): Vector {
  assertVector(base);
  const names = featureNames(model.ablation), d = names.length;
  if (model.version !== 1 || JSON.stringify(model.featureNames) !== JSON.stringify(names) || model.weights.length !== 3 ||
      !model.weights.every(w => w.length === d && w.every(Number.isFinite)) ||
      features.length < d || !features.slice(0, d).every(Number.isFinite)) throw Error("INVALID_INFERENCE_INPUT");
  if (!d) return [...base];
  const scores = base.map((p, k) => logP(p) + model.weights[k].reduce((s, w, j) => s + w * features[j], 0));
  if (!scores.every(Number.isFinite)) throw Error("INVALID_INFERENCE_SCORE");
  return softmax(scores);
}
function fitResidual(rows: FeatureRow[], ablation: Ablation): ResidualModel {
  if (ablation === "base") return identityModel();
  const names = featureNames(ablation), d = names.length, weights = Array.from({ length: 3 }, () => Array(d).fill(0) as number[]);
  // Fixed optimization budget, fixed scaling and regularization; no holdout-dependent tuning.
  for (let iteration = 0; iteration < RESEARCH_PROTOCOL.iterations; iteration++) {
    const grad = weights.map(w => w.map(x => RESEARCH_PROTOCOL.l2 * x));
    for (const row of rows) {
      const p = softmax(row.base.map((x, k) => logP(x) + weights[k].reduce((s, w, j) => s + w * row.features[j], 0)));
      for (let k = 0; k < 3; k++) for (let j = 0; j < d; j++) grad[k][j] += (p[k] - Number(row.outcome === k)) * row.features[j] / rows.length;
    }
    for (let j = 0; j < d; j++) {
      for (let k = 0; k < 3; k++) weights[k][j] -= RESEARCH_PROTOCOL.learningRate * grad[k][j];
      const center = weights.reduce((s, w) => s + w[j], 0) / 3;
      for (let k = 0; k < 3; k++) weights[k][j] -= center; // identifiable zero-sum residuals
    }
  }
  return { version: 1, ablation, featureNames: names, weights };
}
export function oneXTwoLoss(p: Vector, outcome: number) {
  assertVector(p);
  if (![0, 1, 2].includes(outcome)) throw Error("INVALID_CLASS");
  const brier = p.reduce((s, x, k) => s + (x - Number(k === outcome)) ** 2, 0);
  // Ranked order HOME, DRAW, AWAY. Divide by K-1; Brier is unnormalized sum over K.
  const rps = ((p[0] - Number(outcome === 0)) ** 2 + (p[0] + p[1] - Number(outcome <= 1)) ** 2) / 2;
  return { logLoss: -logP(p[outcome]), brier, rps };
}
type Scored = { day: string; outcome: number; p: Vector };
export function scoreOneXTwo(rows: Scored[]) {
  const losses = rows.map(r => oneXTwoLoss(r.p, r.outcome));
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return { n: rows.length, days: new Set(rows.map(r => r.day)).size,
    logLoss: mean(losses.map(x => x.logLoss)), brier: mean(losses.map(x => x.brier)), rps: mean(losses.map(x => x.rps)),
    classCalibration: RESEARCH_PROTOCOL.classOrder.map((side, k) => {
      const bins = Array.from({ length: 10 }, (_, bin) => {
        const group = rows.filter(r => Math.min(9, Math.floor(r.p[k] * 10)) === bin);
        return { lower: bin / 10, n: group.length, predicted: mean(group.map(r => r.p[k])), observed: mean(group.map(r => Number(r.outcome === k))) };
      });
      const predicted = mean(rows.map(r => r.p[k])), observed = mean(rows.map(r => Number(r.outcome === k)));
      return { side, predicted, observed, bias: predicted === null ? null : predicted - observed!,
        ece: rows.length ? bins.reduce((s, b) => s + b.n * Math.abs((b.predicted ?? 0) - (b.observed ?? 0)), 0) / rows.length : null, bins };
    }) };
}
function pairedInterval(rows: FeatureRow[], model: ResidualModel, baseline: string) {
  const groups = new Map<string, ReturnType<typeof oneXTwoLoss>[]>();
  for (const row of rows) {
    const c = oneXTwoLoss(inferOneXTwo(model, row.base, row.features), row.outcome), b = oneXTwoLoss(row.baselines[baseline], row.outcome);
    const group = groups.get(row.day) ?? [];
    group.push({ logLoss: c.logLoss - b.logLoss, brier: c.brier - b.brier, rps: c.rps - b.rps }); groups.set(row.day, group);
  }
  if (groups.size < 5 || rows.length < 20) return null;
  const blocks = [...groups.values()], metrics = ["logLoss", "brier", "rps"] as const;
  let seed = 54231;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples = Array.from({ length: RESEARCH_PROTOCOL.bootstrapReplicates }, () => {
    const sums = { logLoss: 0, brier: 0, rps: 0 }; let n = 0;
    for (let i = 0; i < blocks.length; i++) for (const loss of blocks[Math.floor(random() * blocks.length)]) {
      n++; for (const key of metrics) sums[key] += loss[key];
    }
    return { logLoss: sums.logLoss / n, brier: sums.brier / n, rps: sums.rps / n };
  });
  return { days: groups.size, method: "PAIRED_UTC_DAY_BOOTSTRAP_DESCRIPTIVE", negativeFavorsCandidate: true,
    metrics: Object.fromEntries(metrics.map(key => {
      const xs = samples.map(s => s[key]).sort((a, b) => a - b);
      return [key, { delta: blocks.flat().reduce((s, x) => s + x[key], 0) / rows.length, lower95: xs[24], upper95: xs[974] }];
    })) };
}
export function runOneXTwoResearch(rows: BenchmarkRow[], history: ResearchMatch[]) {
  const features = buildResearchFeatures(rows, history), split = researchDaySplit(features);
  const partitions = Object.fromEntries(Object.entries(split).map(([key, rs]) => [key, { n: rs.length, days: new Set(rs.map(r => r.day)).size,
    from: rs[0]?.day ?? null, to: rs.at(-1)?.day ?? null }]));
  const enough = Object.values(split).every((rs, i) => rs.length >= RESEARCH_PROTOCOL.minimumRows[i] && new Set(rs.map(r => r.day)).size >= RESEARCH_PROTOCOL.minimumDays[i]);
  const models = enough ? ABLATIONS.map(a => fitResidual(split.train, a)) : [identityModel()];
  const scoreModel = (rs: FeatureRow[], model: ResidualModel) => scoreOneXTwo(rs.map(r => ({ day: r.day, outcome: r.outcome, p: inferOneXTwo(model, r.base, r.features) })));
  const validation = models.map(m => ({ ablation: m.ablation, metrics: scoreModel(split.validation, m) }));
  let selected = models[0];
  const baseLoss = validation[0].metrics.logLoss;
  for (let i = 1; i < models.length; i++) {
    const loss = validation[i].metrics.logLoss!, selectedLoss = validation.find(v => v.ablation === selected.ablation)!.metrics.logLoss!;
    if (baseLoss! - loss >= RESEARCH_PROTOCOL.minimumValidationGain && loss < selectedLoss - 1e-12) selected = models[i];
  }
  const comparisons = (rs: FeatureRow[]) => ({ selected: scoreModel(rs, selected),
    ...Object.fromEntries(BASELINES.map(key => [key, scoreOneXTwo(rs.map(r => ({ day: r.day, outcome: r.outcome, p: r.baselines[key] })))])) });
  return { protocol: RESEARCH_PROTOCOL, status: !enough ? "INSUFFICIENT_SAMPLE_BASELINE_FALLBACK" : selected.ablation === "base" ? "NO_VALIDATION_IMPROVEMENT_BASELINE_FALLBACK" : "RESEARCH_CANDIDATE_ONLY",
    partitions, validation, selectedModel: selected,
    // Exposed for reproducible fit/leakage checks, not a production model registry.
    fittedModels: models, terminal: comparisons(split.terminal),
    pairedTerminal: Object.fromEntries(BASELINES.map(key => [key, pairedInterval(split.terminal, selected, key)])),
    coverage: { inputForecasts: rows.length, joinedForecasts: features.length, evaluatedTerminal: split.terminal.length,
      inferenceFailures: 0, noTeamHistory: features.filter(r => !r.homeHistory || !r.awayHistory).length,
      incompleteL10: features.filter(r => r.homeHistory < 10 || r.awayHistory < 10).length,
      denominator: "Existing benchmark cohort only; not all scheduled fixtures" },
    segments: { league: [...new Set(split.terminal.map(r => r.leagueId))].sort((a, b) => a - b).map(leagueId => ({ leagueId, metrics: comparisons(split.terminal.filter(r => r.leagueId === leagueId)) })),
      history: [true, false].map(missing => ({ missingL10: missing, metrics: comparisons(split.terminal.filter(r => (r.homeHistory < 10 || r.awayHistory < 10) === missing)) })) },
    limitations: ["Terminal period was previously explored; neither terminal results nor validation selection authorize live use.",
      "Reconstructed goals-only base, not frozen production inference. Inventory fetchedAt does not establish historical ingestion availability.",
      "UTC preday plus 3h margin is an event-time proxy, not certified final-result availability; later result revisions are unknown.",
      "Only regular-season club fixtures represented in supplied inventories; rest/form omit other competitions and older missing history.",
      "Home intercept assumes non-neutral league fixtures; neutral venue metadata is unavailable. Elo constants and regularization are fixed, not optimized.",
      "Outcome softmax is coherent for 1X2 only, not a calibrated joint score/total/BTTS distribution.",
      "Day-block intervals and small segments are descriptive, not multiple-testing-adjusted evidence; no odds, ROI, CLV or profitability claim.",
      "Fit uses training only, selection uses validation only, and selected weights are not refit on terminal or validation outcomes."],
  };
}
