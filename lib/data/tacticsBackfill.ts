import { prisma } from "@/lib/db";
import { fetchFixtureLineups, fetchFixturesByIds } from "./apiFootball";
import { markLineupChecked, saveFixtureLineups } from "./tactics";

export interface TacticsBackfillStats { fixtures: number; apiCalls: number; savedRows: number; unavailable: number; errors: number }

export async function backfillRecentTactics(limit = 40): Promise<TacticsBackfillStats> {
  const retryBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.matchStatCache.findMany({
    where: { competitive: true, formation: null, OR: [{ lineupCheckedAt: null }, { lineupCheckedAt: { lt: retryBefore } }] }, orderBy: { date: "desc" }, distinct: ["fixtureId"],
    take: Math.min(Math.max(limit, 1), 200), select: { fixtureId: true },
  });
  const stats: TacticsBackfillStats = { fixtures: rows.length, apiCalls: 0, savedRows: 0, unavailable: 0, errors: 0 };
  for (let index = 0; index < rows.length; index += 20) {
    const ids = rows.slice(index, index + 20).map((row) => row.fixtureId);
    let fixtures;
    try { fixtures = await fetchFixturesByIds(ids); stats.apiCalls += 1; }
    catch { stats.errors += ids.length; continue; }
    const byId = new Map(fixtures.map((fixture) => [fixture.fixture.id, fixture]));
    for (const fixtureId of ids) {
      try {
        let lineups = byId.get(fixtureId)?.lineups ?? [];
        if (!lineups.length) { lineups = await fetchFixtureLineups(fixtureId); stats.apiCalls += 1; }
        if (!lineups.length) { stats.unavailable += 1; await markLineupChecked(fixtureId); }
        else stats.savedRows += await saveFixtureLineups(fixtureId, lineups);
      } catch { stats.errors += 1; }
    }
  }
  return stats;
}
