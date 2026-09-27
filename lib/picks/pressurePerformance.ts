/** Pure prospective scoring. Never reconstruct missing frozen baseline probabilities. */
export const PRESSURE_MARKETS = ["OVER_25", "BTTS_YES", "TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] as const;
export type PressureMarket = typeof PRESSURE_MARKETS[number];
export interface PressurePerformanceRow {
  fixtureId: number; kickoff: Date | string; status: string;
  homeGoals: number | null; awayGoals: number | null; inputSnapshot: unknown;
}
type Sample = { probability: number; outcome: number };
export function binaryPerformance(rows: Sample[]) {
  let brier = 0, logLoss = 0;
  for (const row of rows) {
    const p = Math.max(1e-9, Math.min(1 - 1e-9, row.probability));
    brier += (row.probability - row.outcome) ** 2;
    logLoss -= row.outcome * Math.log(p) + (1 - row.outcome) * Math.log(1 - p);
  }
  return { n: rows.length, brier: rows.length ? brier / rows.length : null, logLoss: rows.length ? logLoss / rows.length : null };
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const probability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
export function pressurePerformanceObservation(row: PressurePerformanceRow) {
  const pressure = object(object(row.inputSnapshot).performancePressure);
  const captured = typeof pressure.capturedAt === "string" ? Date.parse(pressure.capturedAt) : NaN;
  const kickoff = new Date(row.kickoff).getTime();
  if (pressure.version !== 5 || !Number.isFinite(captured) || !Number.isFinite(kickoff) || captured >= kickoff) return null;
  if (typeof pressure.context !== "string" || !["LEAGUE", "EURO_CUP", "NATIONAL"].includes(pressure.context) || typeof pressure.artifactVersion !== "number" || !Number.isInteger(pressure.artifactVersion) || pressure.artifactVersion < 1) return null;
  const markets = object(pressure.marketProbabilities);
  const predictions: Partial<Record<PressureMarket, number>> = {};
  for (const market of PRESSURE_MARKETS) if (probability(markets[market])) predictions[market] = markets[market];
  // Older snapshots have only currentOver25. Missing main probabilities stay missing.
  const baseline: Partial<Record<PressureMarket, number>> = {};
  if (probability(pressure.currentOver25)) baseline.OVER_25 = pressure.currentOver25;
  const main = object(pressure.mainMarketProbabilities);
  for (const market of PRESSURE_MARKETS) if (probability(main[market])) baseline[market] = main[market];
  const finished = ["FT", "AET", "PEN"].includes(row.status) && [row.homeGoals, row.awayGoals].every(v => typeof v === "number" && Number.isInteger(v) && v >= 0);
  const h = row.homeGoals!, a = row.awayGoals!;
  const outcomes: Record<PressureMarket, number> | null = finished ? {
    OVER_25: Number(h + a > 2), BTTS_YES: Number(h > 0 && a > 0),
    TEAM_HOME_05: Number(h > 0), TEAM_HOME_15: Number(h > 1), TEAM_AWAY_05: Number(a > 0), TEAM_AWAY_15: Number(a > 1),
  } : null;
  return { fixtureId: row.fixtureId, kickoff, context: pressure.context, artifactVersion: pressure.artifactVersion as number, predictions, baseline, outcomes };
}
export function evaluatePressurePerformance(rows: PressurePerformanceRow[]) {
  const observations = rows.map(pressurePerformanceObservation).filter(v => v !== null).sort((a,b) => a.kickoff-b.kickoff || a.fixtureId-b.fixtureId);
  const groups = new Map<string, typeof observations>();
  for (const row of observations) {
    const key = `${row.context}:${row.artifactVersion}`;
    const group = groups.get(key) ?? [];
    if (!group.some(existing => existing.fixtureId === row.fixtureId)) group.push(row);
    groups.set(key, group);
  }
  return { version: 5, rejected: rows.length - observations.length, cohorts: [...groups.values()].map(group => ({
    context: group[0].context, artifactVersion: group[0].artifactVersion, captured: group.length,
    settled: group.filter(row => row.outcomes !== null).length,
    markets: Object.fromEntries(PRESSURE_MARKETS.map(market => {
      const scored = group.filter(row => row.outcomes !== null && row.predictions[market] !== undefined);
      const paired = scored.filter(row => row.baseline[market] !== undefined);
      return [market, { candidate: binaryPerformance(scored.map(row => ({ probability: row.predictions[market]!, outcome: row.outcomes![market] }))),
        pairedCandidate: binaryPerformance(paired.map(row => ({ probability: row.predictions[market]!, outcome: row.outcomes![market] }))),
        baseline: binaryPerformance(paired.map(row => ({ probability: row.baseline[market]!, outcome: row.outcomes![market] }))),
        baselineUnavailable: scored.length - paired.length }];
    })),
  })) };
}
