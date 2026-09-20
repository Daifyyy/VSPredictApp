import { prisma } from "@/lib/db";
import { SeasonPhaseIndex } from "@/lib/stats/seasonPhases";
import type { SeasonResult } from "@/lib/stats/seasonResults";

/** Explicit offline audit only. Bounded cache batches; never invokes cachedJson or a provider. */
export async function loadCachedSeasonPhases(matches: SeasonResult[]) {
  const index = new SeasonPhaseIndex(matches);
  // Explicit offline use: bounded batches avoid loading every pressure snapshot at once.
  for (let offset = 0; offset < matches.length; offset += 100) {
    const rows = await prisma.fixturePrediction.findMany({
      where: { fixtureId: { in: matches.slice(offset, offset + 100).map(r => r.fixtureId) } },
      select: { fixtureId: true, inputSnapshot: true },
    });
    for (const row of rows) index.addPredictionSnapshot(row.inputSnapshot, `FixturePrediction:${row.fixtureId}`);
  }
  const keys = await prisma.apiCache.findMany({
    where: { OR: ["fix:", "fixdate:", "fixdate-now:", "fixdate-final:", "fixlast:", "stylefix:", "round:"].map(startsWith => ({ key: { startsWith } })) },
    select: { key: true }, orderBy: { key: "asc" },
  });
  let batches = 0;
  for (let offset = 0; offset < keys.length; offset += 50) {
    const rows = await prisma.apiCache.findMany({ where: { key: { in: keys.slice(offset, offset + 50).map(r => r.key) } }, select: { key: true, payload: true } });
    batches++;
    for (const row of rows) index.addFixturePayload(row.payload, `ApiCache:${row.key}`);
  }
  return { index, cacheKeys: keys.length, batches };
}
