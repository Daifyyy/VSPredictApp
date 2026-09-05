import { prisma } from "../lib/db";
import { PUBLIC_CLUB_LEAGUE_IDS, isPublicClubLeague } from "../lib/data/catalog";
import { MODEL_VERSION } from "../lib/data/modelVersion";
import { MODEL_CONTEXT_VERSION } from "../lib/data/modelContext";
import { COUNT_MODEL_VERSION } from "../lib/data/predictionStore";
import { effectiveClose } from "../lib/data/marketSignalStats";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION } from "../lib/picks/marketSignals";
import { auditCornersLive } from "../lib/picks/cornersLiveAudit";
import { overProbNegBin } from "../lib/picks/corners";

async function main() {
  const signals = await prisma.marketSignalSnapshot.findMany({ where: { market: "CARDS", policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION, modelContext: "LEAGUE", contextVersion: MODEL_CONTEXT_VERSION.LEAGUE, modelVersion: MODEL_VERSION, countModelVersion: COUNT_MODEL_VERSION, leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, kickoff: { lt: new Date() } }, orderBy: { kickoff: "asc" } });
  const predictions = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: signals.map((row) => row.fixtureId) } }, select: { fixtureId: true, homeTeamId: true, awayTeamId: true, lambdaCardsHomeBeforeRef: true, lambdaCardsAwayBeforeRef: true, cardVarianceRatio: true, refereeSample: true, refereeFactor: true } });
  const stats = await prisma.matchStatCache.findMany({ where: { fixtureId: { in: signals.map((row) => row.fixtureId) } }, select: { fixtureId: true, teamId: true, yellowCards: true, redCards: true } });
  const predictionByFixture = new Map(predictions.map((row) => [row.fixtureId, row]));
  const rows = signals.map((signal) => {
    const prediction = predictionByFixture.get(signal.fixtureId);
    const actualRows = stats.filter((row) => row.fixtureId === signal.fixtureId && (row.teamId === prediction?.homeTeamId || row.teamId === prediction?.awayTeamId) && (row.yellowCards != null || row.redCards != null));
    const close = effectiveClose(signal);
    const beforeTotal = prediction?.lambdaCardsHomeBeforeRef != null && prediction.lambdaCardsAwayBeforeRef != null ? prediction.lambdaCardsHomeBeforeRef + prediction.lambdaCardsAwayBeforeRef : null;
    const beforeOver = beforeTotal != null && signal.line != null ? overProbNegBin(beforeTotal, signal.line, prediction?.cardVarianceRatio ?? 1.2) : null;
    return {
      fixtureId: signal.fixtureId, leagueId: signal.leagueId, kickoff: signal.kickoff, openedAt: signal.openedAt, side: signal.side, line: signal.line,
      modelProbability: signal.modelProbability, openingProbability: signal.openMarketProbability, closingProbability: close?.probability ?? null,
      actualCount: actualRows.length === 2 ? actualRows.reduce((sum, row) => sum + (row.yellowCards ?? 0) + (row.redCards ?? 0), 0) : null,
      actualTeamRows: actualRows.length, supportedLeague: isPublicClubLeague(signal.leagueId), modelVersion: signal.modelVersion, countModelVersion: signal.countModelVersion,
      noRefProbability: beforeOver == null ? null : signal.side === "OVER" ? beforeOver : 1 - beforeOver,
      refereeApplied: (prediction?.refereeSample ?? 0) > 0 && Math.abs((prediction?.refereeFactor ?? 1) - 1) > .001,
    };
  });
  const all = auditCornersLive(rows);
  const comparableNoRef = rows.filter((row): row is typeof row & { noRefProbability: number } => row.noRefProbability != null).map((row) => ({ ...row, modelProbability: row.noRefProbability }));
  const withoutReferee = auditCornersLive(comparableNoRef);
  const refereeSubset = rows.filter((row) => row.refereeApplied);
  const withReferee = auditCornersLive(refereeSubset);
  const sameSubsetWithoutReferee = auditCornersLive(refereeSubset.filter((row): row is typeof row & { noRefProbability: number } => row.noRefProbability != null).map((row) => ({ ...row, modelProbability: row.noRefProbability })));
  const researchGates = {
    baseIntegrityAndHoldout: all.ready,
    calibrationNotMateriallyWorse: all.model.ece != null && all.opening.ece != null && all.model.ece <= all.opening.ece + .02,
    refereeComparisonSample: withReferee.model.n >= 100 && sameSubsetWithoutReferee.model.n === withReferee.model.n,
    refereeDoesNotWorsenLogLoss: withReferee.model.logLoss != null && sameSubsetWithoutReferee.model.logLoss != null && withReferee.model.logLoss <= sameSubsetWithoutReferee.model.logLoss + .002,
  };
  process.stdout.write(`${JSON.stringify({ decision: Object.values(researchGates).every(Boolean) ? "SHADOW_READY" : "RESEARCH", researchGates, all, refereeComparison: { n: refereeSubset.length, withReferee: withReferee.model, withoutReferee: sameSubsetWithoutReferee.model }, withoutReferee }, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
