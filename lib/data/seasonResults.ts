import { prisma } from "@/lib/db";
import { canonicalSeasonResults } from "@/lib/stats/seasonResults";

/** Two batched reads, no provider calls, no cache writes. Explicit audit/replay use only. */
export async function loadSeasonResults(leagueIds: number[], firstSeason: number, asOf: Date) {
  const where = { leagueId: { in: leagueIds }, season: { gte: firstSeason }, kickoff: { lt: asOf } };
  const select = {
    fixtureId: true, leagueId: true, season: true, kickoff: true,
    homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true,
  } as const;
  const [history, predictions] = await Promise.all([
    prisma.clubEloMatch.findMany({ where: { ...where, context: "LEAGUE" }, select }),
    // Include non-final rows to detect stale completed-history entries after postponement.
    prisma.fixturePrediction.findMany({ where: { ...where, modelContext: "LEAGUE" }, select: { ...select, status: true } }),
  ]);
  return canonicalSeasonResults([
    ...history.map(r => ({ ...r, context: "LEAGUE", source: "COMPLETED_ELO_HISTORY" as const })),
    ...predictions.map(r => ({ ...r, context: "LEAGUE", source: "SETTLED_PREDICTION" as const, status: r.status ?? undefined })),
  ], asOf);
}
