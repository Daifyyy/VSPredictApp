/** Offline preflight only. No labels, fitting, database access or production activation. */
export interface AIReadinessRow {
  fixtureId: number;
  day: string;
  kickoff: string;
  latestHistory: string | null;
  profileMode: 'BASE' | 'ADVANCED' | 'UNAVAILABLE';
}

function dayTime(day: string): number {
  const time = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(time)
    || new Date(time).toISOString().slice(0, 10) !== day) throw Error('INVALID_PREFLIGHT_DAY');
  return time;
}

/** Counts only. Never reads targets or model probabilities. Original whole-day boundaries. */
export function profileReadiness(rows: readonly AIReadinessRow[]) {
  const ids = new Set<number>();
  for (const r of rows) {
    const origin = dayTime(r.day), kickoff = Date.parse(r.kickoff);
    if (!Number.isInteger(r.fixtureId) || r.fixtureId <= 0 || ids.has(r.fixtureId)) throw Error('DUPLICATE_OR_INVALID_FIXTURE');
    ids.add(r.fixtureId);
    if (!Number.isFinite(kickoff) || new Date(kickoff).toISOString().slice(0, 10) !== r.day
      || !['BASE', 'ADVANCED', 'UNAVAILABLE'].includes(r.profileMode)) throw Error('INVALID_PREFLIGHT_ROW');
    if (r.latestHistory != null && (!Number.isFinite(Date.parse(r.latestHistory))
      || Date.parse(r.latestHistory) + 3 * 3600000 >= origin)) throw Error('PREFLIGHT_HISTORY_LEAKAGE');
  }
  const days = [...new Set(rows.map(r => r.day))].sort();
  if (days.length < 10) throw Error('INSUFFICIENT_PREFLIGHT_DAYS');
  const position = new Map(days.map((day, i) => [day, i]));
  const boundaries = [.4, .5, .6, .7, .8].map(p => Math.floor(days.length * p));
  const partition = (start: number, end: number) => {
    const selected = rows.filter(r => position.get(r.day)! >= start && position.get(r.day)! < end);
    return { from: days[start], through: days[end - 1], total: selected.length,
      baseEligible: selected.filter(r => r.profileMode !== 'UNAVAILABLE').length,
      advancedCommonCohort: selected.filter(r => r.profileMode === 'ADVANCED').length,
      unavailable: selected.filter(r => r.profileMode === 'UNAVAILABLE').length };
  };
  const folds = boundaries.slice(0, 3).map((end, i) => ({ train: partition(0, end), validation: partition(end, boundaries[i + 1]) }));
  const development = partition(0, boundaries[3]);
  const calibration = partition(boundaries[3], boundaries[4]);
  const examinedTerminal = partition(boundaries[4], days.length);
  const minimums = { firstFoldTrain: 1000, calibration: 200, terminal: 200 };
  const sampleGate = (key: 'baseEligible' | 'advancedCommonCohort') => ({
    firstFoldTrain: folds[0].train[key] >= minimums.firstFoldTrain,
    calibration: calibration[key] >= minimums.calibration,
    terminal: examinedTerminal[key] >= minimums.terminal,
    allValidationFolds: folds.every(f => f.validation[key] > 0),
  });
  return { days: days.length, development, calibration, examinedTerminal, folds, minimums,
    sampleGates: { base: sampleGate('baseEligible'), advanced: sampleGate('advancedCommonCohort') },
    trainingAllowed: false, activationAllowed: false,
    reason: 'EXAMINED_COHORT_DIAGNOSTIC_ONLY' as const };
}

export interface AIExperimentLock {
  lockedAt: string;
  knownThrough: string;
  developmentThrough: string;
  calibrationFrom: string;
  calibrationThrough: string;
  terminalFrom: string;
  terminalThrough: string;
}

/** Necessary chronological conditions only, NOT approval to train or activate a model. */
export function checkExperimentWindow(lock: AIExperimentLock | null) {
  if (!lock) return { valid: false, reasons: ['PROTOCOL_NOT_LOCKED'] };
  const lockedAt = Date.parse(lock.lockedAt);
  if (!Number.isFinite(lockedAt) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(lock.lockedAt)) throw Error('INVALID_PROTOCOL_LOCK_TIME');
  const known = dayTime(lock.knownThrough), development = dayTime(lock.developmentThrough);
  const calFrom = dayTime(lock.calibrationFrom), calThrough = dayTime(lock.calibrationThrough);
  const testFrom = dayTime(lock.terminalFrom), testThrough = dayTime(lock.terminalThrough);
  const reasons: string[] = [];
  if (!(development < calFrom && calFrom <= calThrough && calThrough < testFrom && testFrom <= testThrough)) reasons.push('OVERLAPPING_OR_REVERSED_PARTITIONS');
  // A new lock cannot turn previously inspected outcomes into unseen calibration or test data.
  if (calFrom <= known || testFrom <= known) reasons.push('PREVIOUSLY_EXAMINED_PERIOD');
  if (calFrom <= lockedAt || testFrom <= lockedAt) reasons.push('LOCK_AFTER_EVALUATION_START');
  return { valid: reasons.length === 0, reasons };
}
