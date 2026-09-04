import { probabilityMetrics, type ProbabilityMetrics } from "./modelLab";

export interface CornerAuditRow {
  fixtureId: number;
  leagueId: number;
  kickoff: Date;
  openedAt: Date;
  side: string;
  line: number | null;
  modelProbability: number;
  openingProbability: number;
  closingProbability: number | null;
  actualCount: number | null;
  actualTeamRows: number;
  supportedLeague: boolean;
  modelVersion: number;
  countModelVersion: number | null;
}

export interface CornerPrelaunchAudit {
  comparable: number;
  freshClosings: number;
  missingActual: number;
  integrityErrors: number;
  model: ProbabilityMetrics;
  opening: ProbabilityMetrics;
  closing: ProbabilityMetrics;
  holdout: { n: number; model: ProbabilityMetrics; opening: ProbabilityMetrics };
  leagues: Array<{ leagueId: number; n: number; model: ProbabilityMetrics; opening: ProbabilityMetrics }>;
  gates: {
    comparableSample: boolean;
    closingSample: boolean;
    integrity: boolean;
    holdoutBrier: boolean;
    holdoutLogLoss: boolean;
  };
  ready: boolean;
}

function outcome(row: CornerAuditRow): boolean | null {
  if (row.actualCount == null || row.line == null) return null;
  if (row.side === "OVER") return row.actualCount > row.line;
  if (row.side === "UNDER") return row.actualCount < row.line;
  return null;
}

function metrics(rows: CornerAuditRow[], probability: (row: CornerAuditRow) => number | null) {
  return probabilityMetrics(rows.flatMap((row) => {
    const result = outcome(row);
    const p = probability(row);
    return result == null || p == null ? [] : [{ probability: p, outcome: result }];
  }));
}

/** Čistý, reprodukovatelný pre-launch audit bez zápisu a bez upstream volání. */
export function auditCornersLive(rows: CornerAuditRow[]): CornerPrelaunchAudit {
  const integrityErrors = rows.filter((row) =>
    !row.supportedLeague ||
    (row.side !== "OVER" && row.side !== "UNDER") ||
    row.line == null || Math.abs(row.line % 1) !== .5 ||
    row.openedAt >= row.kickoff ||
    row.modelProbability <= 0 || row.modelProbability >= 1 ||
    row.openingProbability <= 0 || row.openingProbability >= 1 ||
    (row.actualCount != null && row.actualTeamRows !== 2)
  ).length;
  const comparable = rows.filter((row) => outcome(row) != null && row.supportedLeague && row.actualTeamRows === 2)
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  const withClosing = comparable.filter((row) => row.closingProbability != null);
  const holdout = comparable.slice(Math.floor(comparable.length * .7));
  const model = metrics(comparable, (row) => row.modelProbability);
  const opening = metrics(comparable, (row) => row.openingProbability);
  const closing = metrics(withClosing, (row) => row.closingProbability);
  const holdoutModel = metrics(holdout, (row) => row.modelProbability);
  const holdoutOpening = metrics(holdout, (row) => row.openingProbability);
  const leagueIds = [...new Set(comparable.map((row) => row.leagueId))];
  const leagues = leagueIds.map((leagueId) => {
    const leagueRows = comparable.filter((row) => row.leagueId === leagueId);
    return { leagueId, n: leagueRows.length, model: metrics(leagueRows, (row) => row.modelProbability), opening: metrics(leagueRows, (row) => row.openingProbability) };
  }).sort((a, b) => b.n - a.n || a.leagueId - b.leagueId);
  const gates = {
    comparableSample: comparable.length >= 100,
    closingSample: withClosing.length >= 100,
    integrity: integrityErrors === 0,
    holdoutBrier: holdoutModel.brier != null && holdoutOpening.brier != null && holdoutModel.brier <= holdoutOpening.brier,
    holdoutLogLoss: holdoutModel.logLoss != null && holdoutOpening.logLoss != null && holdoutModel.logLoss <= holdoutOpening.logLoss,
  };
  return {
    comparable: comparable.length,
    freshClosings: withClosing.length,
    missingActual: rows.filter((row) => row.actualCount == null).length,
    integrityErrors,
    model,
    opening,
    closing,
    holdout: { n: holdout.length, model: holdoutModel, opening: holdoutOpening },
    leagues,
    gates,
    ready: Object.values(gates).every(Boolean),
  };
}
