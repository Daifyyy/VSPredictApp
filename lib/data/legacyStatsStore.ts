import { createHash } from 'node:crypto';
import { prisma, isRealDataConfigured } from '../db';
import { sharedReadCache } from '../boundedCache';
import type { PickRule } from '../types';
import { getPublishedPredictionRows, getSettledPredictionRows } from './repository';
import { getCachedCountTotals } from './cache';
import { marketClvSummaries } from './marketSignalStats';
import { checklistPerformance } from './checklistStats';
import { isEuroCupLeague, FIXTURE_LIST_LEAGUE_IDS } from './catalog';
import { MODEL_VERSION } from './modelVersion';
import { MODEL_CONTEXT_VERSION } from './modelContext';
import { backtestRule, computeBenchmarkTrackRecord, computeTrackRecord } from '../picks/trackRecord';
import { computeMarketBenchmark } from '../picks/market';
import { computeReliability } from '../picks/reliability';
import { clvSideOf, summarizeClv } from '../picks/clv';
import { evaluateRule, PICK_PRESETS } from '../picks/rules';
import { computeCountModelAccuracy, computePublishedTipRecord } from '../picks/performance';

export function legacyRuleKey(rule: PickRule) {
  return JSON.stringify([rule.market, rule.venue, rule.minProb, rule.minEdge ?? null, rule.minReadiness ?? null]);
}
const identity = createHash('sha256').update(JSON.stringify({
  model: MODEL_VERSION, contexts: MODEL_CONTEXT_VERSION, leagues: FIXTURE_LIST_LEAGUE_IDS,
  rules: PICK_PRESETS.map(item => legacyRuleKey(item.rule)),
})).digest('hex').slice(0, 16);
export const LEGACY_STATS_KEY = `legacy-stats:v1:${identity}`;

async function loadInputs() {
  const real = isRealDataConfigured();
  const [allRows, allPublishedRows, clvByMarket, checklist] = await Promise.all([
    getSettledPredictionRows(), getPublishedPredictionRows(),
    real ? marketClvSummaries() : Promise.resolve([]),
    real ? checklistPerformance() : Promise.resolve(null),
  ]);
  const actualCounts = real ? await getCachedCountTotals(allRows) : new Map();
  return { rows: allRows.filter(row => row.modelContext === 'LEAGUE'),
    europeanRows: allRows.filter(row => isEuroCupLeague(row.leagueId)),
    nationalRows: allRows.filter(row => row.modelContext === 'NATIONAL'),
    publishedRows: allPublishedRows.filter(row => row.modelContext === 'LEAGUE'),
    europeanPublishedRows: allPublishedRows.filter(row => isEuroCupLeague(row.leagueId)),
    nationalPublishedRows: allPublishedRows.filter(row => row.modelContext === 'NATIONAL'),
    actualCounts, clvByMarket, checklist };
}
type Inputs = Awaited<ReturnType<typeof loadInputs>>;
function commonStats(input: Inputs) {
  function context(rows: Inputs['rows'], published: Inputs['publishedRows']) {
    return { trackRecord: computeTrackRecord(rows), publishedTips: computePublishedTipRecord(published),
      countAccuracy: computeCountModelAccuracy(rows, input.actualCounts),
      benchmark: computeBenchmarkTrackRecord(rows), market: computeMarketBenchmark(rows), reliability: computeReliability(rows) };
  }
  return { ...context(input.rows, input.publishedRows), clvByMarket: input.clvByMarket, checklist: input.checklist,
    european: { experimental: true, promotionSample: 150, ...context(input.europeanRows, input.europeanPublishedRows) },
    national: context(input.nationalRows, input.nationalPublishedRows) };
}
function ruleStats(input: Inputs, rule: PickRule) {
  function context(rows: Inputs['rows']) {
    const picks = rows.flatMap(row => {
      const match = evaluateRule(row, rule);
      if (!match.ok) return [];
      const side = clvSideOf(rule.market, match.side);
      return side ? [{ row, side }] : [];
    });
    return { backtest: backtestRule(rows, rule), clv: summarizeClv(picks) };
  }
  return { ...context(input.rows), european: context(input.europeanRows) };
}
type Base = ReturnType<typeof commonStats>;
type RuleStats = ReturnType<typeof ruleStats>;
function combine(base: Base, selected: RuleStats | null) {
  return { ...base, backtest: selected?.backtest ?? null, clv: selected?.clv ?? null,
    european: { ...base.european, backtest: selected?.european.backtest ?? null, clv: selected?.european.clv ?? null } };
}
export async function computeLegacyStats(rule: PickRule) {
  const inputs = await loadInputs();
  return { ...combine(commonStats(inputs), ruleStats(inputs, rule)), asOf: new Date().toISOString(),
    stale: false, limitedReason: null, backtestLimitedReason: null };
}
type Snapshot = { version: 1; asOf: string; base: Base; presets: Record<string, RuleStats> };

/** Explicit admin work: load history ONCE, compute invariant metrics ONCE. No provider fetch. */
export async function refreshLegacyStats(now = new Date()) {
  const inputs = await loadInputs();
  const report: Snapshot = { version: 1, asOf: now.toISOString(), base: commonStats(inputs),
    presets: Object.fromEntries(PICK_PRESETS.map(item => [legacyRuleKey(item.rule), ruleStats(inputs, item.rule)])) };
  const serialized = JSON.stringify(report);
  if (Buffer.byteLength(serialized, 'utf8') > 250_000) throw new Error('LEGACY_STATS_TOO_LARGE');
  const payload = JSON.parse(serialized), expiresAt = new Date(+now + 90 * 86400_000);
  await prisma.apiCache.upsert({ where: { key: LEGACY_STATS_KEY },
    create: { key: LEGACY_STATS_KEY, payload, expiresAt }, update: { payload, expiresAt } });
  sharedReadCache.delete(LEGACY_STATS_KEY);
  return { processed: inputs.rows.length + inputs.europeanRows.length + inputs.nationalRows.length,
    bytes: Buffer.byteLength(serialized, 'utf8'), asOf: report.asOf };
}
export async function readLegacyStats(rule: PickRule, now = new Date()) {
  const report = await sharedReadCache.read(LEGACY_STATS_KEY, 15 * 60_000, async () => {
    const row = await prisma.apiCache.findUnique({ where: { key: LEGACY_STATS_KEY }, select: { payload: true } });
    const value = row?.payload as unknown as Snapshot | undefined;
    return value?.version === 1 && value.base?.trackRecord && value.base.european && value.base.national
      && value.presets && Number.isFinite(Date.parse(value.asOf)) ? value : null;
  });
  if (!report) return null;
  const selected = report.presets[legacyRuleKey(rule)] ?? null;
  const stale = +now - Date.parse(report.asOf) > 26 * 3600_000;
  return { ...combine(report.base, selected), asOf: report.asOf, stale,
    limitedReason: stale ? 'LEGACY_STATS_STALE' : null,
    backtestLimitedReason: selected ? null : 'CUSTOM_BACKTEST_NOT_PRECOMPUTED' };
}
