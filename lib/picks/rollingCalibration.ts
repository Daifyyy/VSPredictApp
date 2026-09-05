import type { PredictionRow } from "@/lib/types";
import { calibrateOutcome } from "@/lib/stats/predict";
import { fitCalibration } from "./fit";
import { applyLogistic, fitLogistic, type BinaryPoint } from "./temporalCalibration";

export interface CalibrationMetrics {
  n: number;
  logLoss: number;
  brier: number;
  ece: number;
}

export interface RollingFold<T> {
  training: T[];
  holdout: T[];
  trainingTo: Date;
  holdoutFrom: Date;
  holdoutTo: Date;
}

const clamp = (value: number) => Math.min(1 - 1e-9, Math.max(1e-9, value));
const timeOf = (value: string | Date) => new Date(value).getTime();

/** Expanding-window folds. A block with the same kickoff can never straddle the boundary. */
export function rollingFolds<T>(
  values: T[],
  kickoff: (value: T) => string | Date,
  options: { minimumTraining?: number; holdoutSize?: number; maximumFolds?: number } = {}
): RollingFold<T>[] {
  const minimumTraining = options.minimumTraining ?? 120;
  const holdoutSize = options.holdoutSize ?? 50;
  const maximumFolds = options.maximumFolds ?? 4;
  const ordered = [...values].sort((a, b) => timeOf(kickoff(a)) - timeOf(kickoff(b)));
  const folds: RollingFold<T>[] = [];
  let cut = minimumTraining;
  while (cut < ordered.length && folds.length < maximumFolds) {
    while (cut < ordered.length && timeOf(kickoff(ordered[cut - 1])) === timeOf(kickoff(ordered[cut]))) cut++;
    if (cut >= ordered.length) break;
    let end = Math.min(ordered.length, cut + holdoutSize);
    while (end < ordered.length && timeOf(kickoff(ordered[end - 1])) === timeOf(kickoff(ordered[end]))) end++;
    const training = ordered.slice(0, cut);
    const holdout = ordered.slice(cut, end);
    if (!holdout.length) break;
    folds.push({
      training,
      holdout,
      trainingTo: new Date(kickoff(training.at(-1)!)),
      holdoutFrom: new Date(kickoff(holdout[0])),
      holdoutTo: new Date(kickoff(holdout.at(-1)!)),
    });
    cut = end;
  }
  return folds;
}

export function binaryProbabilityMetrics(points: Array<{ probability: number; outcome: boolean }>): CalibrationMetrics {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, observed: 0 }));
  let logLoss = 0;
  let brier = 0;
  for (const point of points) {
    const p = clamp(point.probability);
    const y = Number(point.outcome);
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    brier += (p - y) ** 2;
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.n++;
    bin.predicted += p;
    bin.observed += y;
  }
  const n = points.length;
  return {
    n,
    logLoss: n ? logLoss / n : 0,
    brier: n ? brier / n : 0,
    ece: n ? bins.reduce((sum, bin) => sum + (bin.n / n) * Math.abs(bin.predicted / Math.max(1, bin.n) - bin.observed / Math.max(1, bin.n)), 0) : 0,
  };
}

function outcomeMetrics(points: Array<{ probabilities: [number, number, number]; outcome: 0 | 1 | 2 }>): CalibrationMetrics {
  const reliability = Array.from({ length: 10 }, () => ({ n: 0, confidence: 0, correct: 0 }));
  let logLoss = 0;
  let brier = 0;
  for (const point of points) {
    const p = point.probabilities.map(clamp) as [number, number, number];
    logLoss += -Math.log(p[point.outcome]);
    brier += p.reduce((sum, value, index) => sum + (value - Number(index === point.outcome)) ** 2, 0);
    const predicted = p.indexOf(Math.max(...p));
    const confidence = p[predicted];
    const bin = reliability[Math.min(9, Math.floor(confidence * 10))];
    bin.n++;
    bin.confidence += confidence;
    bin.correct += Number(predicted === point.outcome);
  }
  const n = points.length;
  return {
    n,
    logLoss: n ? logLoss / n : 0,
    brier: n ? brier / n : 0,
    ece: n ? reliability.reduce((sum, bin) => sum + (bin.n / n) * Math.abs(bin.confidence / Math.max(1, bin.n) - bin.correct / Math.max(1, bin.n)), 0) : 0,
  };
}

function decision(baseline: CalibrationMetrics, calibrated: CalibrationMetrics, folds: number) {
  const gates = {
    enoughData: calibrated.n >= 100 && folds >= 2,
    logLossImprovement: baseline.logLoss > 0 ? 1 - calibrated.logLoss / baseline.logLoss : 0,
    brierDelta: calibrated.brier - baseline.brier,
    eceDelta: calibrated.ece - baseline.ece,
  };
  return {
    gates,
    accepted: gates.enoughData && gates.logLossImprovement >= .01 && gates.brierDelta <= .002 && gates.eceDelta <= 0,
  };
}

export function rollingBinaryCalibration(points: BinaryPoint[]) {
  const folds = rollingFolds(points, (point) => point.kickoff);
  const raw: Array<{ probability: number; outcome: boolean }> = [];
  const adjusted: Array<{ probability: number; outcome: boolean }> = [];
  const foldReports = folds.map((fold) => {
    const parameters = fitLogistic(fold.training);
    for (const point of fold.holdout) {
      raw.push({ probability: point.probability, outcome: point.outcome });
      adjusted.push({ probability: applyLogistic(point.probability, parameters), outcome: point.outcome });
    }
    return { training: fold.training.length, holdout: fold.holdout.length, trainingTo: fold.trainingTo, holdoutFrom: fold.holdoutFrom, holdoutTo: fold.holdoutTo, parameters };
  });
  const baseline = binaryProbabilityMetrics(raw);
  const calibrated = binaryProbabilityMetrics(adjusted);
  return { folds: foldReports, baseline, calibrated, ...decision(baseline, calibrated, folds.length), finalParameters: fitLogistic(points) };
}

export function rollingOutcomeCalibration(rows: PredictionRow[]) {
  const usable = rows.filter((row) => row.available && row.homeGoals != null && row.awayGoals != null);
  const folds = rollingFolds(usable, (row) => row.kickoff);
  const raw: Array<{ probabilities: [number, number, number]; outcome: 0 | 1 | 2 }> = [];
  const adjusted: typeof raw = [];
  const foldReports = folds.map((fold) => {
    const fit = fitCalibration(fold.training);
    for (const row of fold.holdout) {
      const outcome: 0 | 1 | 2 = row.homeGoals! > row.awayGoals! ? 0 : row.homeGoals === row.awayGoals ? 1 : 2;
      raw.push({ probabilities: [row.homeWin, row.draw, row.awayWin], outcome });
      adjusted.push({ probabilities: calibrateOutcome(row.homeWin, row.draw, row.awayWin, fit.a, fit.b), outcome });
    }
    return { training: fold.training.length, holdout: fold.holdout.length, trainingTo: fold.trainingTo, holdoutFrom: fold.holdoutFrom, holdoutTo: fold.holdoutTo, parameters: { a: fit.a, b: fit.b }, atGridEdge: fit.atGridEdge };
  });
  const baseline = outcomeMetrics(raw);
  const calibrated = outcomeMetrics(adjusted);
  const final = fitCalibration(usable);
  return { folds: foldReports, baseline, calibrated, ...decision(baseline, calibrated, folds.length), finalParameters: { a: final.a, b: final.b }, atGridEdge: final.atGridEdge || foldReports.some((fold) => fold.atGridEdge) };
}
