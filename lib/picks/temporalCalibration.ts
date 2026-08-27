export interface BinaryPoint { probability: number; outcome: boolean; kickoff: string | Date }
export interface LogisticCalibration { a: number; b: number }
export interface BinaryMetrics { n: number; logLoss: number; brier: number; ece: number }

const clamp = (value: number) => Math.min(1 - 1e-9, Math.max(1e-9, value));
const logit = (value: number) => Math.log(clamp(value) / (1 - clamp(value)));
export function applyLogistic(probability: number, calibration: LogisticCalibration) {
  const z = calibration.a * logit(probability) + calibration.b;
  return 1 / (1 + Math.exp(-z));
}

export function fitLogistic(points: BinaryPoint[], iterations = 5000, learningRate = .03): LogisticCalibration {
  let a = 1, b = 0;
  if (!points.length) return { a, b };
  for (let iteration = 0; iteration < iterations; iteration++) {
    let da = 0, db = 0;
    for (const point of points) { const x = logit(point.probability); const error = applyLogistic(point.probability, { a, b }) - Number(point.outcome); da += error * x; db += error; }
    a -= learningRate * da / points.length;
    b -= learningRate * db / points.length;
  }
  return { a, b };
}

export function binaryMetrics(points: BinaryPoint[], calibration: LogisticCalibration = { a: 1, b: 0 }): BinaryMetrics {
  let logLoss = 0, brier = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, observed: 0 }));
  for (const point of points) { const p = clamp(applyLogistic(point.probability, calibration)); const y = Number(point.outcome); logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p)); brier += (p - y) ** 2; const bin = bins[Math.min(9, Math.floor(p * 10))]; bin.n++; bin.predicted += p; bin.observed += y; }
  const ece = points.length ? bins.reduce((sum, bin) => sum + (bin.n ? bin.n / points.length * Math.abs(bin.predicted / bin.n - bin.observed / bin.n) : 0), 0) : 0;
  return { n: points.length, logLoss: points.length ? logLoss / points.length : 0, brier: points.length ? brier / points.length : 0, ece };
}

export function temporalCalibrationReport(points: BinaryPoint[]) {
  const ordered = [...points].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  const cut = Math.floor(ordered.length * .7);
  // Zápasy se stejným výkopem musí zůstat na jedné straně hranice; jinak by jeden
  // souběžný blok částečně trénoval a částečně hodnotil tutéž point-in-time informaci.
  const boundary = ordered[cut] ? new Date(ordered[cut].kickoff).getTime() : Number.POSITIVE_INFINITY;
  const training = ordered.filter((point) => new Date(point.kickoff).getTime() < boundary);
  const holdout = ordered.filter((point) => new Date(point.kickoff).getTime() >= boundary);
  const calibration = fitLogistic(training);
  const baseline = binaryMetrics(holdout), calibrated = binaryMetrics(holdout, calibration);
  const trainingEnd = training.at(-1)?.kickoff ? new Date(training.at(-1)!.kickoff) : null;
  const holdoutStart = holdout[0]?.kickoff ? new Date(holdout[0].kickoff) : null;
  const noTemporalLeakage = Boolean(trainingEnd && holdoutStart && trainingEnd < holdoutStart);
  const enoughData = training.length >= 70 && holdout.length >= 30;
  const gates = {
    enoughData,
    noTemporalLeakage,
    logLossImprovement: baseline.logLoss > 0 ? 1 - calibrated.logLoss / baseline.logLoss : 0,
    brierDelta: calibrated.brier - baseline.brier,
    eceDelta: calibrated.ece - baseline.ece,
  };
  const accepted = enoughData && noTemporalLeakage && gates.logLossImprovement >= .01 && gates.brierDelta <= .002 && gates.eceDelta <= 0;
  return {
    dataset: {
      n: ordered.length,
      from: ordered[0] ? new Date(ordered[0].kickoff).toISOString() : null,
      to: ordered.at(-1) ? new Date(ordered.at(-1)!.kickoff).toISOString() : null,
      trainingFrom: training[0] ? new Date(training[0].kickoff).toISOString() : null,
      trainingTo: trainingEnd?.toISOString() ?? null,
      holdoutFrom: holdoutStart?.toISOString() ?? null,
      holdoutTo: holdout.at(-1) ? new Date(holdout.at(-1)!.kickoff).toISOString() : null,
    },
    training: training.length, holdout: holdout.length, calibration, baseline, calibrated, gates,
    decision: accepted ? "ACCEPT" as const : "REJECT" as const,
    accepted,
  };
}
