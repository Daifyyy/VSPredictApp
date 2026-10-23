import { describe, expect, it } from 'vitest';
import { profileReadiness, checkExperimentWindow, type AIReadinessRow } from './aiExperimentReadiness';

const rows = (): AIReadinessRow[] => Array.from({ length: 100 }, (_, i) => {
  const day = new Date(Date.UTC(2025, 0, 1 + Math.floor(i / 2))).toISOString().slice(0, 10);
  return { fixtureId: i + 1, day, kickoff: `${day}T18:00:00Z`, latestHistory: null,
    profileMode: i % 2 ? 'BASE' : 'ADVANCED' };
});
const lock = { lockedAt: '2026-10-23T19:00:00Z', knownThrough: '2026-10-23', developmentThrough: '2026-10-23',
  calibrationFrom: '2026-10-24', calibrationThrough: '2026-11-23', terminalFrom: '2026-11-24', terminalThrough: '2027-01-31' };
describe('AI experiment readiness', () => {
  it('uses whole days and the same eligible cohort for advanced versus base', () => {
    const result = profileReadiness(rows());
    expect(result.development.total).toBe(70);
    expect(result.calibration.total).toBe(10);
    expect(result.examinedTerminal.total).toBe(20);
    expect(result.development.advancedCommonCohort).toBe(35);
    expect(result.trainingAllowed).toBe(false);
    expect(result.sampleGates.advanced.firstFoldTrain).toBe(false);
  });
  it('is independent of order and does not read target values', () => {
    const a = rows();
    expect(profileReadiness(a)).toEqual(profileReadiness([...a].reverse().map(r => ({ ...r, over: 1, outcome: 2 }))));
  });
  it('excludes unavailable rows without shifting temporal boundaries', () => {
    const a = rows(); a[0].profileMode = 'UNAVAILABLE';
    const result = profileReadiness(a);
    expect(result.development.total).toBe(70);
    expect(result.development.baseEligible).toBe(69);
    expect(result.development.unavailable).toBe(1);
  });
  it('rejects duplicate fixtures and invalid dates', () => {
    const a = rows();
    expect(() => profileReadiness([...a, a[0]])).toThrow('FIXTURE');
    a[0].day = '2025-02-30';
    expect(() => profileReadiness(a)).toThrow('DAY');
  });
  it('enforces strict prior-day history plus three-hour margin', () => {
    const a = rows(); a[0].latestHistory = '2024-12-31T21:00:00Z';
    expect(() => profileReadiness(a)).toThrow('LEAKAGE');
    a[0].latestHistory = '2024-12-31T20:59:59Z';
    expect(() => profileReadiness(a)).not.toThrow();
  });
  it('requires a protocol lock and a genuinely future evaluation window', () => {
    expect(checkExperimentWindow(null).valid).toBe(false);
    expect(checkExperimentWindow(lock)).toEqual({ valid: true, reasons: [] });
    expect(checkExperimentWindow({ ...lock, calibrationFrom: '2026-09-01' }).reasons).toContain('PREVIOUSLY_EXAMINED_PERIOD');
  });
  it('rejects overlap, hindsight lock and malformed lock time', () => {
    expect(checkExperimentWindow({ ...lock, terminalFrom: lock.calibrationThrough }).reasons).toContain('OVERLAPPING_OR_REVERSED_PARTITIONS');
    expect(checkExperimentWindow({ ...lock, lockedAt: '2026-10-24T00:00:00Z' }).reasons).toContain('LOCK_AFTER_EVALUATION_START');
    expect(() => checkExperimentWindow({ ...lock, lockedAt: '2026-10-23' })).toThrow('LOCK_TIME');
  });
});
