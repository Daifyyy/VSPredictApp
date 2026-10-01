import { prisma } from "../db";
import { STRATEGY_CATALOG, type ModelLabContext, type ModelLabLedgerRow } from "../picks/modelLab";
import { teamGoalOpportunityDecision } from "../picks/marketSignals";
import { strategyCohort, ledgerClv } from "../picks/strategyCohort";

export const MODEL_LAB_REPORT_VERSION = 2;
const TEAM_MARKETS = ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"];
// Historical reporting never needs frozen model JSON or complete odds time series.
const commonSelect = {
  id: true, fixtureId: true, leagueId: true, kickoff: true, policyVersion: true,
  market: true, side: true, line: true, modelProbability: true, decimalOdds: true,
  modelContext: true, modelVersion: true, contextVersion: true, countModelVersion: true,
  bookmaker: true, openingBookmaker: true, closingBenchmarkProbability: true,
  sameBookClv: true, probabilityClv: true, closingFreshness: true,
  closingBenchmarkQuality: true, clvMethodVersion: true, closedAt: true,
} as const;

/** Batched read of frozen selections. No odds fetch, model inference or source mutation. */
export async function loadModelStrategyLedger(context: ModelLabContext, strategy?: string) {
  const definitions = STRATEGY_CATALOG.filter(item => !strategy || item.strategy === strategy);
  const autonomous = definitions.filter(item => !["TEAM_GOALS", "PRESSURE_FLOW_V5"].includes(item.strategy));
  const signalDefinitions = definitions.filter(item => ["TEAM_GOALS", "PRESSURE_FLOW_V5"].includes(item.strategy));
  const [tips, signals] = await Promise.all([
    autonomous.length ? prisma.autonomousTipSnapshot.findMany({ where: { status: "candidate", OR: autonomous.map(item => ({ strategy: item.strategy, policyVersion: item.policyVersion, ...strategyCohort(item.strategy, context) })) }, select: { ...commonSelect, strategy: true, homeTeamId: true, awayTeamId: true, marketProbability: true, qualifiedAt: true, stake: true, closingMarketProbability: true, actualCount: true, hit: true }, orderBy: [{ qualifiedAt: "asc" }, { id: "asc" }] }) : [],
    signalDefinitions.length ? prisma.marketSignalSnapshot.findMany({ where: { OR: signalDefinitions.map(item => ({ policyVersion: item.policyVersion, ...strategyCohort(item.strategy, context), ...(item.strategy === "TEAM_GOALS" ? { market: { in: TEAM_MARKETS } } : {}) })) }, select: { ...commonSelect, openMarketProbability: true, closeMarketProbability: true, openedAt: true }, orderBy: [{ openedAt: "asc" }, { id: "asc" }] }) : [],
  ]);
  const ids = [...new Set([...tips, ...signals].map(row => row.fixtureId))];
  const countIds = [...new Set(tips.filter(row => ["CORNERS", "CARDS", "FOULS"].includes(row.market)).map(row => row.fixtureId))];
  const [fixtures, stats] = await Promise.all([
    ids.length ? prisma.fixturePrediction.findMany({ where: { fixtureId: { in: ids } }, select: { fixtureId: true, homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true, status: true } }) : [],
    countIds.length ? prisma.matchStatCache.findMany({ where: { fixtureId: { in: countIds } }, select: { fixtureId: true, teamId: true, corners: true, yellowCards: true, redCards: true, fouls: true } }) : [],
  ]);
  const byFixture = new Map(fixtures.map(row => [row.fixtureId, row]));
  const byTeam = new Map(stats.map(row => [`${row.fixtureId}:${row.teamId}`, row]));
  function count(fixtureId: number, teamId: number, market: string) {
    const stat = byTeam.get(`${fixtureId}:${teamId}`);
    if (!stat) return null;
    if (market === "FOULS") return stat.fouls;
    if (market === "CORNERS") return stat.corners;
    return stat.yellowCards == null && stat.redCards == null ? null : (stat.yellowCards ?? 0) + (stat.redCards ?? 0);
  }
  const ledger: Array<ModelLabLedgerRow & { dataWarning?: string }> = tips.map(row => {
    const fixture = byFixture.get(row.fixtureId);
    const mismatch = !!fixture && (row.homeTeamId !== fixture.homeTeamId || row.awayTeamId !== fixture.awayTeamId);
    const home = count(row.fixtureId, row.homeTeamId, row.market), away = count(row.fixtureId, row.awayTeamId, row.market);
    return { ...row, ...ledgerClv(row), storedHit: row.hit,
      homeGoals: mismatch ? null : fixture?.homeGoals ?? null, awayGoals: mismatch ? null : fixture?.awayGoals ?? null,
      actualCount: row.actualCount ?? (home != null && away != null ? home + away : null),
      ...(mismatch ? { dataWarning: "FIXTURE_IDENTITY_MISMATCH" } : {}),
    };
  });
  const teamWinners = new Map<number, { signal: typeof signals[number]; probability: number; score: number }>();
  for (const signal of signals.filter(row => row.policyVersion === 3)) {
    const decision = teamGoalOpportunityDecision({ fixtureId: signal.fixtureId, market: signal.market, line: signal.line, modelProbability: signal.modelProbability, marketProbability: signal.openMarketProbability, decimalOdds: signal.decimalOdds });
    if (decision.eligible && (!teamWinners.has(signal.fixtureId) || decision.score > teamWinners.get(signal.fixtureId)!.score)) teamWinners.set(signal.fixtureId, { signal, probability: decision.decisionProbability, score: decision.score });
  }
  for (const signal of signals) {
    if (signal.policyVersion === 3 && teamWinners.get(signal.fixtureId)?.signal.id !== signal.id) continue;
    const fixture = byFixture.get(signal.fixtureId);
    ledger.push({ ...signal, ...ledgerClv(signal), strategy: signal.policyVersion === 501 ? "PRESSURE_FLOW_V5" : "TEAM_GOALS",
      modelProbability: signal.policyVersion === 3 ? teamWinners.get(signal.fixtureId)!.probability : signal.modelProbability,
      marketProbability: signal.openMarketProbability, closingMarketProbability: signal.closeMarketProbability,
      qualifiedAt: signal.openedAt, stake: 1, decimalOdds: signal.policyVersion === 1 ? null : signal.decimalOdds,
      homeGoals: fixture?.homeGoals ?? null, awayGoals: fixture?.awayGoals ?? null,
    });
  }
  return { ledger, byFixture };
}
