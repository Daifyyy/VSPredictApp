export const MODEL_EVALUATION_VERSION = 1;

export type ModelEvaluationRow = {
  fixtureId: number;
  leagueId: number;
  kickoff: Date;
  homeWin: number;
  draw: number;
  awayWin: number;
  homeGoals: number | null;
  awayGoals: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsCloseHome: number | null;
  oddsCloseDraw: number | null;
  oddsCloseAway: number | null;
};

type Triple = [number, number, number];

function devig(home: number | null, draw: number | null, away: number | null): Triple | null {
  if (home == null || draw == null || away == null || home <= 1 || draw <= 1 || away <= 1) return null;
  const raw: Triple = [1 / home, 1 / draw, 1 / away];
  const sum = raw[0] + raw[1] + raw[2];
  return Number.isFinite(sum) && sum > 0 ? [raw[0] / sum, raw[1] / sum, raw[2] / sum] : null;
}

function score(rows: ModelEvaluationRow[], pick: (row: ModelEvaluationRow) => Triple | null) {
  let n = 0, hits = 0, logLoss = 0, brier = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, probability: 0, outcome: 0 }));
  for (const row of rows) {
    if (row.homeGoals == null || row.awayGoals == null) continue;
    const probabilities = pick(row);
    if (!probabilities || probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) continue;
    const outcome = row.homeGoals > row.awayGoals ? 0 : row.homeGoals < row.awayGoals ? 2 : 1;
    n++;
    if (probabilities.indexOf(Math.max(...probabilities)) === outcome) hits++;
    logLoss -= Math.log(Math.max(.001, probabilities[outcome]));
    for (let index = 0; index < 3; index++) {
      brier += (probabilities[index] - (index === outcome ? 1 : 0)) ** 2;
      const bin = bins[Math.min(9, Math.floor(probabilities[index] * 10))];
      bin.n++;
      bin.probability += probabilities[index];
      bin.outcome += index === outcome ? 1 : 0;
    }
  }
  const ece = n ? bins.reduce((sum, bin) => bin.n ? sum + bin.n / (n * 3) * Math.abs(bin.probability / bin.n - bin.outcome / bin.n) : sum, 0) : null;
  return { n, accuracy: n ? hits / n : null, logLoss: n ? logLoss / n : null, brier: n ? brier / n : null, ece };
}

export function evaluateModelRows(rows: ModelEvaluationRow[]) {
  const unique = new Map<number, ModelEvaluationRow>();
  for (const row of rows) if (!unique.has(row.fixtureId)) unique.set(row.fixtureId, row);
  const clean = [...unique.values()].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  const model = score(clean, (row) => [row.homeWin, row.draw, row.awayWin]);
  const opening = score(clean, (row) => devig(row.oddsHome, row.oddsDraw, row.oddsAway));
  const closing = score(clean, (row) => devig(row.oddsCloseHome, row.oddsCloseDraw, row.oddsCloseAway));
  return {
    sampleSize: model.n,
    fromKickoff: clean[0]?.kickoff ?? null,
    toKickoff: clean.at(-1)?.kickoff ?? null,
    model,
    opening,
    closing,
    dataQuality: {
      inputRows: rows.length,
      duplicateFixtureIds: rows.length - unique.size,
      openingCoverage: model.n ? opening.n / model.n : 0,
      closingCoverage: model.n ? closing.n / model.n : 0,
    },
  };
}
