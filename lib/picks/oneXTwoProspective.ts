import { scoreOneXTwo, type Vector } from './oneXTwoResearch';

export type ProspectiveRow = {
  id: string; fixtureId: number; leagueId: number; kickoff: Date; openedAt: Date;
  modelVersion: number; contextVersion: number; modelContext: string;
  audit: unknown; homeTeamId: number | null; awayTeamId: number | null;
  resultKickoff: Date | null; status: string | null; homeGoals: number | null; awayGoals: number | null;
};
type Pair = { day: string; outcome: number; model: Vector; market: Vector | null; quality: string };
const vector = (v: unknown): v is Vector => Array.isArray(v) && v.length === 3
  && v.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1)
  && Math.abs(v.reduce((a, b) => a + b, 0) - 1) <= 1e-6;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const time = (v: unknown) => typeof v === 'string' ? Date.parse(v) : NaN;
const validScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const score = (rows: Pair[], source: 'model' | 'market') => scoreOneXTwo(rows.map(r => ({ day: r.day, outcome: r.outcome, p: r[source]! })));
function paired(rows: Pair[]) {
  const model = score(rows, 'model'), market = score(rows, 'market');
  return { n: rows.length, model, market, logLossDelta: model.logLoss == null ? null : model.logLoss - market.logLoss!,
    brierDelta: model.brier == null ? null : model.brier - market.brier! };
}

/** Descriptive prospective audit, never a selection/promotion gate or a request-time history scan. */
export function evaluateOneXTwoProspective(input: ProspectiveRow[], asOf: Date) {
  if (!Number.isFinite(+asOf)) throw Error('INVALID_AUDIT_TIME');
  const reasons: Record<string, number> = {};
  const reject = (reason: string) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };
  const seen = new Set<number>();
  const groups = new Map<string, { version: number; contextVersion: number; context: string; parameters: Record<string, unknown>; rows: Pair[] }>();
  let valid = 0, pending = 0, missingMarket = 0, future = 0, overdue = 0, nonRegulation = 0, missingFinalAudit = 0;
  const sorted = [...input].sort((a, b) => +a.openedAt - +b.openedAt || a.id.localeCompare(b.id));
  for (const row of sorted) {
    // Select the first signal, not a later snapshot chosen after knowing the result.
    if (seen.has(row.fixtureId)) { reject('DUPLICATE_FIXTURE'); continue; }
    seen.add(row.fixtureId);
    const a = row.audit;
    if (!object(a) || a.version !== 1) { reject('AUDIT_NOT_CAPTURED'); if (row.status === 'FT') missingFinalAudit++; continue; }
    if (a.fixtureId !== row.fixtureId || a.homeTeamId !== row.homeTeamId || a.awayTeamId !== row.awayTeamId
      || !Number.isInteger(row.homeTeamId) || !Number.isInteger(row.awayTeamId) || row.homeTeamId === row.awayTeamId
      || time(a.kickoff) !== +row.kickoff || !row.resultKickoff || +row.resultKickoff !== +row.kickoff) { reject('IDENTITY_OR_KICKOFF_MISMATCH'); continue; }
    if (a.modelVersion !== row.modelVersion || a.contextVersion !== row.contextVersion || a.modelContext !== row.modelContext) { reject('VERSION_MISMATCH'); continue; }
    const capture = time(a.capturedAt), predicted = time(a.predictedAt);
    if (!Number.isFinite(capture) || !Number.isFinite(predicted) || predicted > capture || capture >= +row.kickoff
      || capture > +asOf || +row.openedAt !== capture) { reject('INVALID_POINT_IN_TIME'); continue; }
    if (!vector(a.model)) { reject('INVALID_MODEL_VECTOR'); continue; }
    if (!object(a.modelParameters) || ['rho', 'sharpen', 'calibA', 'calibB'].some(k => a.modelParameters && object(a.modelParameters)
      && a.modelParameters[k] !== null && (typeof a.modelParameters[k] !== 'number' || !Number.isFinite(a.modelParameters[k])))) { reject('PARAMETERS_NOT_CAPTURED'); continue; }
    valid++;
    if (row.status !== 'FT' || +row.kickoff >= +asOf) {
      pending++;
      if (+row.kickoff >= +asOf) future++;
      else if (['AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO', 'PST'].includes(row.status ?? '')) nonRegulation++;
      else if (+asOf - +row.kickoff >= 6 * 3600_000) overdue++;
      continue;
    }
    if (!validScore(row.homeGoals) || !validScore(row.awayGoals)) { reject('FINAL_SCORE_MISSING'); continue; }
    const parameters = Object.fromEntries(['rho', 'sharpen', 'calibA', 'calibB'].map(k => [k, (a.modelParameters as Record<string, unknown>)[k]]));
    const key = JSON.stringify([row.modelVersion, row.modelContext, row.contextVersion, parameters]);
    const group = groups.get(key) ?? { version: row.modelVersion, context: row.modelContext, contextVersion: row.contextVersion, parameters, rows: [] };
    const quality = typeof a.quality === 'string' ? a.quality : 'UNAVAILABLE';
    const market = ['PANEL', 'PINNACLE_SINGLE'].includes(quality) && a.method === 'NORMALIZED_PANEL_LOGIT_MEDIAN_1X2_V1' && vector(a.market) ? a.market : null;
    if (!market) missingMarket++;
    group.rows.push({ day: row.kickoff.toISOString().slice(0, 10), outcome: row.homeGoals > row.awayGoals ? 0 : row.homeGoals === row.awayGoals ? 1 : 2,
      model: a.model, market, quality });
    groups.set(key, group);
  }
  return { version: 1 as const, asOf: asOf.toISOString(), status: 'DESCRIPTIVE_NOT_VALIDATED' as const,
    coverage: { sourceRows: input.length, uniqueFixtures: seen.size, validAudits: valid, pendingOrNonRegulationFinal: pending, future, overdue, nonRegulation, completedWithoutAudit: missingFinalAudit, settled: [...groups.values()].reduce((s, g) => s + g.rows.length, 0), missingMarket }, reasons,
    cohorts: [...groups.values()].map(g => ({ modelVersion: g.version, modelContext: g.context, contextVersion: g.contextVersion, parameters: g.parameters,
      allModel: score(g.rows, 'model'), panel: paired(g.rows.filter(r => r.market && r.quality === 'PANEL')),
      pinnacleSingle: paired(g.rows.filter(r => r.market && r.quality === 'PINNACLE_SINGLE')) })),
    notes: ['Only frozen opening forecasts; no reconstructed historical forecasts.', 'Model and market comparisons have identical rows and denominators.',
      'Panel and single-book benchmarks are separate. Negative deltas favor the model.', 'FT regulation-time results only; postponed identities and extra-time outcomes are not substituted.',
      'All captured market-signal fixtures, not all scheduled fixtures. No ROI, profitability or automatic model approval.'] };
}
