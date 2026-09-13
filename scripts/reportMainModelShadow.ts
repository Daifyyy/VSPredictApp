import { prisma } from "../lib/db";
import { MAIN_MODEL_SHADOW_METHOD, MAIN_MODEL_SHADOW_VERSION } from "../lib/picks/mainModelShadow";
import { evaluateModelRows, type ModelEvaluationRow } from "../lib/picks/modelEvaluation";

async function main() {
  const shadows = await prisma.mainModelShadowPrediction.findMany({
    where: { shadowVersion: MAIN_MODEL_SHADOW_VERSION, method: MAIN_MODEL_SHADOW_METHOD },
    orderBy: { kickoff: "asc" },
  });
  const fixtures = await prisma.fixturePrediction.findMany({
    where: { fixtureId: { in: shadows.map((row) => row.fixtureId) }, homeGoals: { not: null }, awayGoals: { not: null } },
    select: { fixtureId: true, leagueId: true, kickoff: true, homeGoals: true, awayGoals: true, oddsCloseHome: true, oddsCloseDraw: true, oddsCloseAway: true },
  });
  const fixtureById = new Map(fixtures.map((row) => [row.fixtureId, row]));
  const rows = shadows.flatMap((shadow) => {
    const fixture = fixtureById.get(shadow.fixtureId);
    if (!fixture) return [];
    const common = {
      fixtureId: shadow.fixtureId, leagueId: fixture.leagueId, kickoff: shadow.kickoff,
      homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals,
      oddsHome: 1 / shadow.marketHome, oddsDraw: 1 / shadow.marketDraw, oddsAway: 1 / shadow.marketAway,
      oddsCloseHome: fixture.oddsCloseHome, oddsCloseDraw: fixture.oddsCloseDraw, oddsCloseAway: fixture.oddsCloseAway,
    };
    return [{
      source: { ...common, homeWin: shadow.sourceHome, draw: shadow.sourceDraw, awayWin: shadow.sourceAway } satisfies ModelEvaluationRow,
      shadow: { ...common, homeWin: shadow.homeProbability, draw: shadow.drawProbability, awayWin: shadow.awayProbability } satisfies ModelEvaluationRow,
    }];
  });
  const source = evaluateModelRows(rows.map((row) => row.source));
  const shadow = evaluateModelRows(rows.map((row) => row.shadow));
  process.stdout.write(`${JSON.stringify({
    shadowVersion: MAIN_MODEL_SHADOW_VERSION,
    method: MAIN_MODEL_SHADOW_METHOD,
    captured: shadows.length,
    settled: rows.length,
    from: shadows[0]?.kickoff ?? null,
    to: shadows.at(-1)?.kickoff ?? null,
    sourceV7: source.model,
    shadowV8: shadow.model,
    openingMarket: shadow.opening,
    closingMarket: shadow.closing,
    dataQuality: shadow.dataQuality,
    verdict: rows.length < 100 ? "COLLECT" : shadow.model.logLoss != null && source.model.logLoss != null && shadow.model.logLoss < source.model.logLoss ? "V8_BEATS_V7" : "KEEP_V7",
  }, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
