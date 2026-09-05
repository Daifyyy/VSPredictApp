import { prisma } from "../lib/db";
import { MODEL_VERSION } from "../lib/data/modelVersion";
import { MODEL_CONTEXT_VERSION } from "../lib/data/modelContext";
import { PUBLIC_CLUB_LEAGUE_IDS } from "../lib/data/catalog";
import { FOUL_MODEL_VERSION } from "../lib/picks/fouls";
import { countForecastAudit } from "../lib/picks/countForecastAudit";

async function main() {
  const predictions = await prisma.fixturePrediction.findMany({
    where: { modelVersion: MODEL_VERSION, modelContext: "LEAGUE", contextVersion: MODEL_CONTEXT_VERSION.LEAGUE, foulModelVersion: FOUL_MODEL_VERSION, leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, status: { in: ["FT", "AET", "PEN"] }, lambdaFoulsHome: { not: null }, lambdaFoulsAway: { not: null } },
    orderBy: { kickoff: "asc" },
    select: { fixtureId: true, leagueId: true, kickoff: true, homeTeamId: true, awayTeamId: true, lambdaFoulsHome: true, lambdaFoulsAway: true },
  });
  const stats = await prisma.matchStatCache.findMany({ where: { fixtureId: { in: predictions.map((row) => row.fixtureId) } }, select: { fixtureId: true, teamId: true, fouls: true } });
  const points = predictions.flatMap((prediction) => {
    const actual = stats.filter((row) => row.fixtureId === prediction.fixtureId && (row.teamId === prediction.homeTeamId || row.teamId === prediction.awayTeamId) && row.fouls != null);
    return actual.length === 2 ? [{ kickoff: prediction.kickoff, leagueId: prediction.leagueId, predicted: prediction.lambdaFoulsHome! + prediction.lambdaFoulsAway!, actual: actual.reduce((sum, row) => sum + row.fouls!, 0) }] : [];
  });
  process.stdout.write(`${JSON.stringify({ missingActual: predictions.length - points.length, ...countForecastAudit(points) }, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
