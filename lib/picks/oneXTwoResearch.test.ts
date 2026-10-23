import { describe, expect, it } from "vitest";
import { ABLATIONS, BASELINES, buildResearchFeatures, inferOneXTwo, oneXTwoLoss, researchDaySplit,
  runOneXTwoResearch, scoreOneXTwo, type ResearchMatch, type Vector } from "./oneXTwoResearch";
import type { BenchmarkRow } from "./forecastBenchmark";

function fixture(fixtureId: number, day: number, hour = 12): ResearchMatch {
  return { fixtureId, leagueId: 39, date: new Date(Date.UTC(2025, 0, day, hour)).toISOString(),
    homeTeamId: 1, awayTeamId: 2, homeGoals: fixtureId % 3, awayGoals: 1 };
}
function forecast(m: ResearchMatch, p: Vector = [.45, .3, .25]): BenchmarkRow {
  return { fixtureId: m.fixtureId, leagueId: m.leagueId, date: m.date, homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    forecasts: Object.fromEntries(BASELINES.map(key => [key, { over: .5, oneXTwo: [...p] as Vector }])) };
}
function dataset() {
  const history = Array.from({ length: 400 }, (_, i) => ({ ...fixture(i + 1, Math.floor(i / 4) + 1, 12 + i % 4),
    homeTeamId: 1 + (i % 4) * 2, awayTeamId: 2 + (i % 4) * 2 }));
  return { history, rows: history.map(m => forecast(m)) };
}

describe("point-in-time feature construction", () => {
  it("excludes same day and the exact 3h boundary; includes strictly earlier completions", () => {
    const early = { ...fixture(1, 1, 20), homeGoals: 3, awayGoals: 0 };
    const boundary = fixture(2, 1, 21), late = fixture(3, 1, 22), target = fixture(4, 2, 18), future = fixture(5, 3);
    const base = buildResearchFeatures([forecast(target)], [early, boundary, late, target, future])[0];
    expect(base.homeHistory).toBe(1);
    expect(base.latestTrainingKickoff).toBe(early.date);
    expect(base.features[3]).toBeGreaterThan(0); // home Elo above initial, opponent below
    expect(base.features[4]).toBeLessThan(0);
    expect(base.features[7]).toBe(1); // L5 three points / 3
    const changed = [early, boundary, late, target, future].map(m => m.fixtureId === 1 ? m : { ...m, homeGoals: 9, awayGoals: 0 });
    const result = buildResearchFeatures([forecast(changed[3])], changed)[0];
    expect(result.features).toEqual(base.features);
  });
  it("uses last 5 and last 10, keeps own/opponent context and does not mix leagues", () => {
    const past = Array.from({ length: 10 }, (_, i) => ({ ...fixture(i + 1, i + 1), homeGoals: i < 5 ? 0 : 3, awayGoals: i < 5 ? 3 : 0 }));
    const target = fixture(20, 12), foreign = { ...fixture(30, 10), leagueId: 40, homeGoals: 20, awayGoals: 0 };
    const [r] = buildResearchFeatures([forecast(target)], [...past, foreign, target]);
    expect(r.homeHistory).toBe(10);
    expect(r.features.slice(7, 11)).toEqual([1, 1, .5, 0]);
    expect(r.features.slice(15, 19)).toEqual([0, -1, .5, 0]);
    expect(buildResearchFeatures([forecast(target)], [...past, target])[0].features).toEqual(r.features);
  });
  it("has explicit missingness, finite priors and order-independent features", () => {
    const m = fixture(1, 1), r = buildResearchFeatures([forecast(m)], [m])[0];
    expect(r.homeHistory).toBe(0);
    expect(r.features.every(Number.isFinite)).toBe(true);
    expect(r.features.slice(3, 7)).toEqual([0, 0, 1, 1]);
    expect(r.features.slice(12, 15)).toEqual([1, 1, 1]);
    const { rows, history } = dataset();
    expect(buildResearchFeatures([...rows].reverse(), [...history].reverse())).toEqual(buildResearchFeatures(rows, history));
  });
});

describe("validation and probability contracts", () => {
  it("rejects duplicates, malformed vectors/results, invalid identities and unmatched joins", () => {
    const m = fixture(1, 1), row = forecast(m);
    expect(() => buildResearchFeatures([row, row], [m])).toThrow("DUPLICATE_FORECAST");
    expect(() => buildResearchFeatures([row], [m, m])).toThrow("DUPLICATE_HISTORY");
    expect(() => buildResearchFeatures([row], [])).toThrow("MISMATCH");
    expect(() => buildResearchFeatures([{ ...row, homeGoals: 99 }], [m])).toThrow("MISMATCH");
    expect(() => buildResearchFeatures([row], [{ ...m, homeGoals: NaN }])).toThrow("INVALID_HISTORY");
    expect(() => buildResearchFeatures([row], [{ ...m, awayTeamId: 1 }])).toThrow("INVALID_HISTORY");
    expect(() => buildResearchFeatures([{ ...row, date: "invalid" }], [m])).toThrow("INVALID_FORECAST");
    for (const p of [[.5, .5, .5], [NaN, .5, .5], [-.1, .5, .6]]) {
      expect(() => buildResearchFeatures([forecast(m, p as Vector)], [m])).toThrow("INVALID_VECTOR");
    }
  });
  it("scores draw and all classes with explicit Brier/RPS conventions", () => {
    expect(oneXTwoLoss([0, 1, 0], 1)).toEqual({ logLoss: -0, brier: 0, rps: 0 });
    expect(oneXTwoLoss([1, 0, 0], 2).rps).toBe(1);
    expect(oneXTwoLoss([1, 0, 0], 1).rps).toBe(.5);
    expect(oneXTwoLoss([1, 0, 0], 2).brier).toBe(2);
    const score = scoreOneXTwo([{ p: [.2, .6, .2], outcome: 1, day: "2025-01-01" }]);
    expect(score.classCalibration[1].side).toBe("DRAW");
    expect(score.classCalibration[1].observed).toBe(1);
    expect(score.classCalibration[1].bins[6].n).toBe(1);
    expect(scoreOneXTwo([]).logLoss).toBeNull();
    expect(() => oneXTwoLoss([.3, .3, .4], 3)).toThrow("INVALID_CLASS");
  });
});

describe("bounded offline fitting", () => {
  it("groups UTC playing days chronologically 60/20/20", () => {
    const { rows, history } = dataset(), split = researchDaySplit(buildResearchFeatures(rows, history));
    expect([split.train.length, split.validation.length, split.terminal.length]).toEqual([240, 80, 80]);
    expect(split.train.at(-1)!.day < split.validation[0].day).toBe(true);
    expect(split.validation.at(-1)!.day < split.terminal[0].day).toBe(true);
    expect(new Set(split.train.map(r => r.day)).size).toBe(60);
  });
  it("terminal outcomes cannot change any fitted weights or validation selection", () => {
    const { rows, history } = dataset(), a = runOneXTwoResearch(rows, history);
    const ids = new Set(researchDaySplit(buildResearchFeatures(rows, history)).terminal.map(r => r.fixtureId));
    const mutate = <T extends { fixtureId: number; homeGoals: number; awayGoals: number }>(r: T): T => ids.has(r.fixtureId) ? { ...r, homeGoals: 8, awayGoals: 0 } : r;
    const b = runOneXTwoResearch(rows.map(mutate), history.map(mutate));
    expect(a.fittedModels).toEqual(b.fittedModels);
    expect(a.selectedModel).toEqual(b.selectedModel);
    expect(a.validation).toEqual(b.validation);
    expect(a.terminal).not.toEqual(b.terminal);
    expect(a.protocol.activation).toBe("FORBIDDEN_PREVIOUSLY_EXPLORED_PERIOD");
    expect(a.fittedModels.map(m => m.ablation)).toEqual([...ABLATIONS]);
  });
  it("validation outcomes never enter fitting, and a genuine validation gain can select a challenger", () => {
    const data = dataset();
    const history = data.history.map(m => ({ ...m, homeGoals: 1, awayGoals: 1 }));
    const rows = history.map(m => forecast(m, [.45, .1, .45]));
    const a = runOneXTwoResearch(rows, history);
    expect(a.status).toBe("RESEARCH_CANDIDATE_ONLY");
    expect(a.selectedModel.ablation).not.toBe("base");
    const selectedLoss = a.validation.find(v => v.ablation === a.selectedModel.ablation)!.metrics.logLoss!;
    expect(a.validation[0].metrics.logLoss! - selectedLoss).toBeGreaterThanOrEqual(.002);
    const ids = new Set(researchDaySplit(buildResearchFeatures(rows, history)).validation.map(r => r.fixtureId));
    const alteredHistory = history.map(m => ids.has(m.fixtureId) ? { ...m, homeGoals: 4, awayGoals: 0 } : m);
    const alteredRows = rows.map(r => ids.has(r.fixtureId) ? { ...r, homeGoals: 4, awayGoals: 0 } : r);
    const b = runOneXTwoResearch(alteredRows, alteredHistory);
    expect(a.fittedModels).toEqual(b.fittedModels);
    expect(a.validation).not.toEqual(b.validation);
    expect(b.protocol.activation).toBe("FORBIDDEN_PREVIOUSLY_EXPLORED_PERIOD");
  });
  it("returns coherent finite vectors including missing-history inputs; inference is immutable", () => {
    const { rows, history } = dataset(), report = runOneXTwoResearch(rows, history), first = buildResearchFeatures(rows, history)[0];
    for (const model of report.fittedModels) {
      const before = JSON.stringify(model), p = inferOneXTwo(model, first.base, first.features);
      expect(p.every(x => Number.isFinite(x) && x >= 0 && x <= 1)).toBe(true);
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(JSON.stringify(model)).toBe(before);
    }
    const model = report.fittedModels[1];
    expect(() => inferOneXTwo(model, first.base, [NaN, 0, 0])).toThrow("INVALID_INFERENCE");
    expect(() => inferOneXTwo({ ...model, weights: [[Infinity], [], []] }, first.base, first.features)).toThrow("INVALID_INFERENCE");
    expect(report.coverage.joinedForecasts).toBe(rows.length);
    expect(report.pairedTerminal.stabilized100?.days).toBe(20);
  });
  it("falls back to baseline for insufficient samples and no validation gain", () => {
    const m = fixture(1, 1), short = runOneXTwoResearch([forecast(m)], [m]);
    expect(short.status).toBe("INSUFFICIENT_SAMPLE_BASELINE_FALLBACK");
    expect(short.selectedModel.ablation).toBe("base");
    const { rows, history } = dataset();
    const perfect = rows.map(r => forecast(history.find(m => m.fixtureId === r.fixtureId)!,
      r.homeGoals > r.awayGoals ? [1, 0, 0] : r.homeGoals === r.awayGoals ? [0, 1, 0] : [0, 0, 1]));
    const report = runOneXTwoResearch(perfect, history);
    expect(report.status).toBe("NO_VALIDATION_IMPROVEMENT_BASELINE_FALLBACK");
    expect(report.selectedModel.ablation).toBe("base");
    expect(inferOneXTwo(report.selectedModel, [.2, .3, .5], [])).toEqual([.2, .3, .5]);
  });
});
