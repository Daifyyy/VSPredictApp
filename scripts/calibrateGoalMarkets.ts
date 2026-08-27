import { prisma } from "../lib/db";
import { PUBLIC_CLUB_LEAGUE_IDS } from "../lib/data/catalog";
import { temporalCalibrationReport } from "../lib/picks/temporalCalibration";

async function main() {
const rows = await prisma.fixturePrediction.findMany({ where: { leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, modelContext: "LEAGUE", status: { in: ["FT", "AET", "PEN"] }, homeGoals: { not: null }, awayGoals: { not: null } }, orderBy: { kickoff: "asc" }, select: { fixtureId: true, kickoff: true, leagueId: true, modelVersion: true, contextVersion: true, over25: true, bttsYes: true, homeGoals: true, awayGoals: true } });
const report = temporalCalibrationReport(rows.map((row) => ({ probability: row.over25, outcome: row.homeGoals! + row.awayGoals! > 2.5, kickoff: row.kickoff })));
const uniqueFixtures = new Set(rows.map((row) => row.fixtureId));
const versions = [...new Set(rows.map((row) => `${row.modelVersion}:${row.contextVersion}`))];
const bttsByLeague = [...new Set(rows.map((row) => row.leagueId))].map((leagueId) => {
  const league = rows.filter((row) => row.leagueId === leagueId);
  const diagnostic = temporalCalibrationReport(league.map((row) => ({ probability: row.bttsYes, outcome: row.homeGoals! > 0 && row.awayGoals! > 0, kickoff: row.kickoff })));
  return { leagueId, n: league.length, baseline: diagnostic.baseline };
});
process.stdout.write(`${JSON.stringify({
  market: "OVER_25",
  datasetVersion: `fixture-prediction:${versions.join(",")}`,
  duplicateFixtureIds: rows.length - uniqueFixtures.size,
  rule: "70/30 temporal holdout; accept log-loss >=1% better, Brier <= +0.002, ECE not worse; report never changes production parameters",
  ...report,
  bttsDiagnostic: { decision: "OBSERVE", minimumBeforeCalibration: 250, byLeague: bttsByLeague },
}, null, 2)}\n`);
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
