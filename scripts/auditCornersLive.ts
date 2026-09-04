import { prisma } from "../lib/db";
import { PUBLIC_CLUB_LEAGUE_IDS, isPublicClubLeague } from "../lib/data/catalog";
import { MODEL_VERSION } from "../lib/data/modelVersion";
import { MODEL_CONTEXT_VERSION } from "../lib/data/modelContext";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION } from "../lib/picks/marketSignals";
import { effectiveClose } from "../lib/data/marketSignalStats";
import { auditCornersLive } from "../lib/picks/cornersLiveAudit";
import { AUTONOMOUS_POLICY_VERSION, CORNERS_LIVE_COUNT_MODEL_VERSION } from "../lib/picks/autonomousPortfolio";

async function main() {
const activate = process.argv.includes("--activate");
const persist = activate || process.argv.includes("--persist");
const signals = await prisma.marketSignalSnapshot.findMany({
  where: {
    market: "CORNERS",
    policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION,
    modelContext: "LEAGUE",
    contextVersion: MODEL_CONTEXT_VERSION.LEAGUE,
    modelVersion: MODEL_VERSION,
    countModelVersion: CORNERS_LIVE_COUNT_MODEL_VERSION,
    leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] },
    kickoff: { lt: new Date() },
  },
  orderBy: { kickoff: "asc" },
});
const fixtureIds = signals.map((row) => row.fixtureId);
const [predictions, stats] = await Promise.all([
  prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, homeTeamId: true, awayTeamId: true } }),
  prisma.matchStatCache.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, teamId: true, corners: true } }),
]);
const predictionByFixture = new Map(predictions.map((row) => [row.fixtureId, row]));
const auditRows = signals.map((row) => {
  const prediction = predictionByFixture.get(row.fixtureId);
  const actualRows = stats.filter((item) => item.fixtureId === row.fixtureId && (item.teamId === prediction?.homeTeamId || item.teamId === prediction?.awayTeamId) && item.corners != null);
  const close = effectiveClose(row);
  return {
    fixtureId: row.fixtureId,
    leagueId: row.leagueId,
    kickoff: row.kickoff,
    openedAt: row.openedAt,
    side: row.side,
    line: row.line,
    modelProbability: row.modelProbability,
    openingProbability: row.openMarketProbability,
    closingProbability: close?.probability ?? null,
    actualCount: actualRows.length === 2 ? actualRows.reduce((sum, item) => sum + item.corners!, 0) : null,
    actualTeamRows: actualRows.length,
    supportedLeague: isPublicClubLeague(row.leagueId),
    modelVersion: row.modelVersion,
    countModelVersion: row.countModelVersion,
  };
});
const report = auditCornersLive(auditRows);

if (persist) {
  if (activate && !report.ready) throw new Error(`Rohový live test nelze aktivovat: ${JSON.stringify(report.gates)}`);
  const now = new Date();
  const reportMilestone = activate ? 0 : -Math.floor(now.getTime() / 1000);
  await prisma.$transaction(async (tx) => {
    const previous = await tx.modelStrategyDefinition.findUnique({
      where: { strategy_policyVersion_modelContext_modelVersion: { strategy: "CORNERS", policyVersion: AUTONOMOUS_POLICY_VERSION.CORNERS, modelContext: "LEAGUE", modelVersion: MODEL_VERSION } },
    });
    const definition = await tx.modelStrategyDefinition.upsert({
      where: { strategy_policyVersion_modelContext_modelVersion: { strategy: "CORNERS", policyVersion: AUTONOMOUS_POLICY_VERSION.CORNERS, modelContext: "LEAGUE", modelVersion: MODEL_VERSION } },
      create: { strategy: "CORNERS", policyVersion: AUTONOMOUS_POLICY_VERSION.CORNERS, market: "CORNERS", modelContext: "LEAGUE", modelVersion: MODEL_VERSION, status: activate ? "LIVE_TEST" : "RESEARCH", title: "Rohy Over/Under v1", rules: { probability: .6, edge: .05, expectedValue: .03, minimumSamples: 3, minimumReadiness: 6, latestQualificationMinutes: 15 }, decisionCriteria: { milestones: [50, 100, 200], closingCompleteness: .85 }, minimumSample: 200, startedAt: now },
      update: activate ? { status: "LIVE_TEST", startedAt: previous?.status === "LIVE_TEST" ? previous.startedAt : now, endedAt: null } : { title: "Rohy Over/Under v1" },
    });
    await tx.modelStrategyReviewReport.upsert({
      where: { definitionId_milestone: { definitionId: definition.id, milestone: reportMilestone } },
      create: { definitionId: definition.id, milestone: reportMilestone, datasetFrom: signals.at(0)?.kickoff, datasetTo: signals.at(-1)?.kickoff, trainingTo: signals[Math.max(0, Math.floor(signals.length * .7) - 1)]?.kickoff, holdoutFrom: signals[Math.floor(signals.length * .7)]?.kickoff, sampleSize: report.comparable, pricedSample: 0, closingSample: report.freshClosings, metrics: JSON.parse(JSON.stringify({ model: report.model, opening: report.opening, closing: report.closing, holdout: report.holdout, leagues: report.leagues })), gates: JSON.parse(JSON.stringify(report.gates)), recommendation: report.ready ? "LIVE_TEST" : "RESEARCH" },
      update: {},
    });
    if (activate && previous?.status !== "LIVE_TEST") await tx.modelStrategyStatusAudit.create({ data: { definitionId: definition.id, fromStatus: previous?.status ?? "RESEARCH", toStatus: "LIVE_TEST", reason: "Pre-launch audit rohů splnil datové, holdout a closingové brány.", changedBy: "scripts/auditCornersLive.ts" } });
  });
}

process.stdout.write(`${JSON.stringify({ activate, persist, ...report }, null, 2)}\n`);
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
