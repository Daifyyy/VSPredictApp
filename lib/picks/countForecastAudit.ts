export interface CountForecastPoint { kickoff: Date; leagueId: number; predicted: number; actual: number }

function metrics(rows: CountForecastPoint[], prediction: (row: CountForecastPoint) => number) {
  if (!rows.length) return { n: 0, mae: null, rmse: null, bias: null };
  let absolute = 0, squared = 0, bias = 0;
  for (const row of rows) {
    const error = prediction(row) - row.actual;
    absolute += Math.abs(error);
    squared += error ** 2;
    bias += error;
  }
  return { n: rows.length, mae: absolute / rows.length, rmse: Math.sqrt(squared / rows.length), bias: bias / rows.length };
}

/** Temporal 70/30 audit against a constant learned only from the training period. */
export function countForecastAudit(points: CountForecastPoint[]) {
  const ordered = [...points].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  const rawCut = Math.floor(ordered.length * .7);
  const boundary = ordered[rawCut]?.kickoff.getTime() ?? Number.POSITIVE_INFINITY;
  const training = ordered.filter((row) => row.kickoff.getTime() < boundary);
  const holdout = ordered.filter((row) => row.kickoff.getTime() >= boundary);
  const globalMean = training.length ? training.reduce((sum, row) => sum + row.actual, 0) / training.length : 0;
  const leagueMeans = new Map<number, number>();
  for (const leagueId of new Set(training.map((row) => row.leagueId))) {
    const league = training.filter((row) => row.leagueId === leagueId);
    if (league.length >= 20) leagueMeans.set(leagueId, league.reduce((sum, row) => sum + row.actual, 0) / league.length);
  }
  const model = metrics(holdout, (row) => row.predicted);
  const baseline = metrics(holdout, (row) => leagueMeans.get(row.leagueId) ?? globalMean);
  const improvement = model.mae != null && baseline.mae ? 1 - model.mae / baseline.mae : null;
  return {
    dataset: { n: ordered.length, training: training.length, holdout: holdout.length, trainingTo: training.at(-1)?.kickoff ?? null, holdoutFrom: holdout[0]?.kickoff ?? null },
    model,
    baseline,
    maeImprovement: improvement,
    accepted: holdout.length >= 50 && improvement != null && improvement >= .02 && Math.abs(model.bias ?? Infinity) <= Math.abs(baseline.bias ?? Infinity),
  };
}
