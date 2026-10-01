import { expect, it } from 'vitest';
import { evaluatePressurePerformance, type PressurePerformanceRow } from './pressurePerformance';
import { emptyPressureAccumulator, pressureAccumulatorReport, pressureContribution, replacePressureContribution } from './pressurePerformanceIncremental';
const row = (id: number, home = 1, status = 'FT'): PressurePerformanceRow => ({ fixtureId: id, kickoff: '2026-09-21T12:00:00Z', status, homeGoals: home, awayGoals: 1,
  inputSnapshot: { performancePressure: { version: 5, artifactVersion: 1, context: 'LEAGUE', capturedAt: '2026-09-21T10:00:00Z', currentOver25: .6, marketProbabilities: { OVER_25: .7, BTTS_YES: .8 } } } });
it('agrees with full scoring, including unpaired baselines', () => {
  const rows = [row(1), row(2, 3), row(3, 0, 'NS')];
  const acc = emptyPressureAccumulator();
  rows.forEach(r => replacePressureContribution(acc, undefined, pressureContribution(r)));
  expect(pressureAccumulatorReport(acc)).toEqual(evaluatePressurePerformance(rows));
});
it('replaces corrected results without double-counting, including return to pending', () => {
  const acc = emptyPressureAccumulator();
  let old = pressureContribution(row(1));
  replacePressureContribution(acc, undefined, old);
  for (const nextRow of [row(1, 3), row(1, 3), row(1, 0, 'NS'), row(1, 0)]) {
    const next = pressureContribution(nextRow);
    replacePressureContribution(acc, old, next); old = next;
    expect(pressureAccumulatorReport(acc)).toEqual(evaluatePressurePerformance([nextRow]));
  }
});
it('distinguishes rejected from absent and moves cohorts on corrected artifact/context', () => {
  const acc = emptyPressureAccumulator();
  replacePressureContribution(acc, undefined, null);
  expect(acc.rejected).toBe(1);
  const next = pressureContribution(row(1))!;
  replacePressureContribution(acc, null, next);
  replacePressureContribution(acc, next, { ...next, context: 'NATIONAL', artifactVersion: 2 });
  expect(acc.rejected).toBe(0);
  expect(pressureAccumulatorReport(acc).cohorts).toHaveLength(1);
  expect(pressureAccumulatorReport(acc).cohorts[0].context).toBe('NATIONAL');
});
