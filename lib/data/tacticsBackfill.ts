import { prisma } from "@/lib/db";
import { fetchFixtureLineups, fetchFixturesByIds } from "./apiFootball";
import { markLineupChecked, saveFixtureLineups } from "./tactics";

export interface TacticsBackfillStats { fixtures: number; apiCalls: number; savedRows: number; unavailable: number; errors: number }

export async function backfillRecentTactics(limit = 30): Promise<TacticsBackfillStats> {
  const now = new Date();
  const upcoming = await prisma.fixturePrediction.findMany({
    where: { status: 'NS', kickoff: { gt: now, lt: new Date(+now + 72 * 3600_000) } },
    orderBy: { kickoff: 'asc' }, take: 50, select: { homeTeamId: true, awayTeamId: true },
  });
  const teamIds = [...new Set(upcoming.flatMap(row => [row.homeTeamId, row.awayTeamId]))];
  if (!teamIds.length) return { fixtures: 0, apiCalls: 0, savedRows: 0, unavailable: 0, errors: 0 };
  const retryBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.matchStatCache.findMany({
    where: { teamId: { in: teamIds }, date: { gt: new Date(+now - 90 * 86400_000), lt: new Date(+now - 3 * 3600_000) },
      goalsFor: { not: null }, goalsAgainst: { not: null }, competitive: true, formation: null, OR: [{ lineupCheckedAt: null }, { lineupCheckedAt: { lt: retryBefore } }] }, orderBy: { date: "desc" }, distinct: ["fixtureId"],
    take: Math.min(Math.max(limit, 1), 30), select: { fixtureId: true },
  });
  const stats: TacticsBackfillStats = { fixtures: rows.length, apiCalls: 0, savedRows: 0, unavailable: 0, errors: 0 };
  for (let index = 0; index < rows.length; index += 20) {
    const ids = rows.slice(index, index + 20).map((row) => row.fixtureId);
    let fixtures;
    try { stats.apiCalls += 1; fixtures = await fetchFixturesByIds(ids); }
    catch { stats.errors += ids.length; continue; }
    const byId = new Map(fixtures.map((fixture) => [fixture.fixture.id, fixture]));
    for (const fixtureId of ids) {
      try {
        let lineups = byId.get(fixtureId)?.lineups ?? [];
        if (!lineups.length) { stats.apiCalls += 1; lineups = await fetchFixtureLineups(fixtureId); }
        if (!lineups.length) { stats.unavailable += 1; await markLineupChecked(fixtureId); }
        else stats.savedRows += await saveFixtureLineups(fixtureId, lineups);
      } catch { stats.errors += 1; }
    }
  }
  return stats;
}
