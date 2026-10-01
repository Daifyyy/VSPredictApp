import { PRESSURE_MARKETS, pressurePerformanceObservation, type PressureMarket, type PressurePerformanceRow } from './pressurePerformance';

type Sum = { n: number; brier: number; logLoss: number };
type MarketSums = { candidate: Sum; pairedCandidate: Sum; baseline: Sum };
type Cohort = { context: string; artifactVersion: number; captured: number; settled: number; markets: Record<PressureMarket, MarketSums> };
export type PressureContribution = ReturnType<typeof pressurePerformanceObservation>;
export interface PressureAccumulator { version: 1; rejected: number; cohorts: Record<string, Cohort> }
export const emptyPressureAccumulator = (): PressureAccumulator => ({ version: 1, rejected: 0, cohorts: {} });
export const pressureContribution = (row: PressurePerformanceRow) => pressurePerformanceObservation(row);
const emptySum = (): Sum => ({ n: 0, brier: 0, logLoss: 0 });

function apply(acc: PressureAccumulator, row: PressureContribution, direction: 1 | -1) {
  if (!row) { acc.rejected += direction; return; }
  const key = `${row.context}:${row.artifactVersion}`;
  const cohort = acc.cohorts[key] ??= { context: row.context, artifactVersion: row.artifactVersion, captured: 0, settled: 0,
    markets: Object.fromEntries(PRESSURE_MARKETS.map(market => [market, { candidate: emptySum(), pairedCandidate: emptySum(), baseline: emptySum() }])) as Record<PressureMarket, MarketSums> };
  cohort.captured += direction;
  cohort.settled += row.outcomes ? direction : 0;
  function add(sum: Sum, probability: number, outcome: number) {
    const p = Math.max(1e-9, Math.min(1 - 1e-9, probability));
    sum.n += direction;
    sum.brier += direction * (probability - outcome) ** 2;
    sum.logLoss -= direction * (outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p));
    if (!sum.n) { sum.brier = 0; sum.logLoss = 0; }
    if (sum.n < 0) throw new Error('PRESSURE_INCREMENTAL_COUNT_UNDERFLOW');
  }
  if (row.outcomes) for (const market of PRESSURE_MARKETS) {
    const p = row.predictions[market], baseline = row.baseline[market], y = row.outcomes[market];
    if (p === undefined) continue;
    add(cohort.markets[market].candidate, p, y);
    if (baseline !== undefined) { add(cohort.markets[market].pairedCandidate, p, y); add(cohort.markets[market].baseline, baseline, y); }
  }
  if (cohort.captured < 0 || cohort.settled < 0 || acc.rejected < 0) throw new Error('PRESSURE_INCREMENTAL_COUNT_UNDERFLOW');
  if (!cohort.captured) delete acc.cohorts[key];
}

/** undefined means no previous row; null means a captured but rejected input. */
export function replacePressureContribution(acc: PressureAccumulator, old: PressureContribution | undefined, next: PressureContribution) {
  if (old !== undefined) apply(acc, old, -1);
  apply(acc, next, 1);
}
export function pressureAccumulatorReport(acc: PressureAccumulator) {
  const metric = (sum: Sum) => ({ n: sum.n, brier: sum.n ? Math.max(0, sum.brier / sum.n) : null, logLoss: sum.n ? Math.max(0, sum.logLoss / sum.n) : null });
  return { version: 5, rejected: acc.rejected, cohorts: Object.values(acc.cohorts)
    .sort((a, b) => a.context.localeCompare(b.context) || a.artifactVersion - b.artifactVersion)
    .map(cohort => ({ ...cohort, markets: Object.fromEntries(PRESSURE_MARKETS.map(market => {
      const sums = cohort.markets[market];
      return [market, { candidate: metric(sums.candidate), pairedCandidate: metric(sums.pairedCandidate), baseline: metric(sums.baseline), baselineUnavailable: sums.candidate.n - sums.baseline.n }];
    })) })) };
}
