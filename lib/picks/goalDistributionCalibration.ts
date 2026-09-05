import type { PredictionRow } from "@/lib/types";
import { drawTau, poissonVector } from "@/lib/stats/predict";
import { rollingFolds } from "./rollingCalibration";

const MAX_GOALS = 10;
const clamp = (value: number) => Math.min(1 - 1e-9, Math.max(1e-9, value));

export interface GoalDistributionParameters { totalScale: number; homeShareShift: number; rho: number }

function sigmoid(value: number) { return 1 / (1 + Math.exp(-value)); }
function logit(value: number) { const p = clamp(value); return Math.log(p / (1 - p)); }

export function goalDistributionProbabilities(lambdaHome: number, lambdaAway: number, parameters: GoalDistributionParameters) {
  const sourceTotal = Math.max(.1, lambdaHome + lambdaAway);
  const total = sourceTotal * parameters.totalScale;
  const homeShare = sigmoid(logit(lambdaHome / sourceTotal) + parameters.homeShareShift);
  const homeLambda = total * homeShare;
  const awayLambda = total - homeLambda;
  const homeVector = poissonVector(homeLambda);
  const awayVector = poissonVector(awayLambda);
  let norm = 0, home = 0, draw = 0, away = 0, over25 = 0, btts = 0;
  const scores: number[][] = Array.from({ length: MAX_GOALS + 1 }, () => Array(MAX_GOALS + 1).fill(0));
  for (let h = 0; h <= MAX_GOALS; h++) for (let a = 0; a <= MAX_GOALS; a++) {
    const probability = homeVector[h] * awayVector[a] * drawTau(h, a, homeLambda, awayLambda, parameters.rho);
    scores[h][a] = probability;
    norm += probability;
    if (h > a) home += probability; else if (h === a) draw += probability; else away += probability;
    if (h + a > 2) over25 += probability;
    if (h > 0 && a > 0) btts += probability;
  }
  const divisor = norm || 1;
  return { homeLambda, awayLambda, home: home / divisor, draw: draw / divisor, away: away / divisor, over25: over25 / divisor, btts: btts / divisor, score: (h: number, a: number) => h <= MAX_GOALS && a <= MAX_GOALS ? scores[h][a] / divisor : 1e-9 };
}

function evaluate(rows: PredictionRow[], parameters: GoalDistributionParameters) {
  let n = 0, scoreLogLoss = 0, outcomeLogLoss = 0, outcomeBrier = 0, overLogLoss = 0, bttsLogLoss = 0;
  for (const row of rows) {
    if (row.homeGoals == null || row.awayGoals == null) continue;
    const p = goalDistributionProbabilities(row.lambdaHome, row.lambdaAway, parameters);
    const outcome = row.homeGoals > row.awayGoals ? 0 : row.homeGoals === row.awayGoals ? 1 : 2;
    const outcomes = [p.home, p.draw, p.away];
    const over = row.homeGoals + row.awayGoals > 2;
    const btts = row.homeGoals > 0 && row.awayGoals > 0;
    scoreLogLoss += -Math.log(clamp(p.score(row.homeGoals, row.awayGoals)));
    outcomeLogLoss += -Math.log(clamp(outcomes[outcome]));
    outcomeBrier += outcomes.reduce((sum, value, index) => sum + (value - Number(index === outcome)) ** 2, 0);
    overLogLoss += -(Number(over) * Math.log(clamp(p.over25)) + Number(!over) * Math.log(clamp(1 - p.over25)));
    bttsLogLoss += -(Number(btts) * Math.log(clamp(p.btts)) + Number(!btts) * Math.log(clamp(1 - p.btts)));
    n++;
  }
  return { n, scoreLogLoss: n ? scoreLogLoss / n : 0, outcomeLogLoss: n ? outcomeLogLoss / n : 0, outcomeBrier: n ? outcomeBrier / n : 0, overLogLoss: n ? overLogLoss / n : 0, bttsLogLoss: n ? bttsLogLoss / n : 0 };
}

function fit(rows: PredictionRow[]): GoalDistributionParameters {
  let best: GoalDistributionParameters = { totalScale: 1, homeShareShift: 0, rho: -.03 };
  let bestLoss = evaluate(rows, best).scoreLogLoss;
  for (const totalScale of [.9, .95, 1, 1.05, 1.1]) for (const homeShareShift of [-.1, -.05, 0, .05, .1]) for (const rho of [-.15, -.1, -.05, 0, .05]) {
    const candidate = { totalScale, homeShareShift, rho };
    const loss = evaluate(rows, candidate).scoreLogLoss;
    if (loss < bestLoss) { best = candidate; bestLoss = loss; }
  }
  return best;
}

export function rollingGoalDistributionCalibration(rows: PredictionRow[]) {
  const usable = rows.filter((row) => row.available && row.homeGoals != null && row.awayGoals != null);
  const folds = rollingFolds(usable, (row) => row.kickoff);
  const baselineRows: ReturnType<typeof evaluate>[] = [];
  const candidateRows: ReturnType<typeof evaluate>[] = [];
  const foldReports = folds.map((fold) => {
    const parameters = fit(fold.training);
    const baseline = evaluate(fold.holdout, { totalScale: 1, homeShareShift: 0, rho: -.03 });
    const calibrated = evaluate(fold.holdout, parameters);
    baselineRows.push(baseline); candidateRows.push(calibrated);
    return { training: fold.training.length, holdout: fold.holdout.length, trainingTo: fold.trainingTo, holdoutFrom: fold.holdoutFrom, holdoutTo: fold.holdoutTo, parameters, baseline, calibrated };
  });
  const combine = (parts: ReturnType<typeof evaluate>[]) => {
    const n = parts.reduce((sum, part) => sum + part.n, 0);
    const weighted = (key: Exclude<keyof ReturnType<typeof evaluate>, "n">) => n ? parts.reduce((sum, part) => sum + part[key] * part.n, 0) / n : 0;
    return { n, scoreLogLoss: weighted("scoreLogLoss"), outcomeLogLoss: weighted("outcomeLogLoss"), outcomeBrier: weighted("outcomeBrier"), overLogLoss: weighted("overLogLoss"), bttsLogLoss: weighted("bttsLogLoss") };
  };
  const baseline = combine(baselineRows);
  const calibrated = combine(candidateRows);
  const gates = {
    enoughData: calibrated.n >= 100 && folds.length >= 2,
    scoreLogLossImprovement: baseline.scoreLogLoss ? 1 - calibrated.scoreLogLoss / baseline.scoreLogLoss : 0,
    outcomeLogLossDelta: calibrated.outcomeLogLoss - baseline.outcomeLogLoss,
    overLogLossDelta: calibrated.overLogLoss - baseline.overLogLoss,
    bttsLogLossDelta: calibrated.bttsLogLoss - baseline.bttsLogLoss,
  };
  const accepted = gates.enoughData && gates.scoreLogLossImprovement >= .005 && gates.outcomeLogLossDelta <= .002 && gates.overLogLossDelta <= .002 && gates.bttsLogLossDelta <= .002;
  return { folds: foldReports, baseline, calibrated, gates, accepted, finalParameters: fit(usable) };
}
