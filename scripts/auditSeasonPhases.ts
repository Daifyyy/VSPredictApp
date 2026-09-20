// No provider calls, writes, or production imports that trigger refreshes.
import { prisma } from "../lib/db";
import { PUBLIC_CLUB_LEAGUES } from "../lib/data/catalog";
import { loadSeasonResults } from "../lib/data/seasonResults";
import { loadCachedSeasonPhases } from "../lib/data/seasonPhases";
import { summarizeSeasonPhases } from "../lib/stats/seasonPhases";
async function main() {
  const date = process.argv.find(a => a.startsWith("--cutoff="))?.slice(9) ?? "2026-09-20";
  const cutoff = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(cutoff.getTime()) || cutoff.toISOString().slice(0, 10) !== date) throw new Error("Invalid cutoff");
  const season = cutoff.getUTCMonth() >= 6 ? cutoff.getUTCFullYear() : cutoff.getUTCFullYear() - 1;
  const results = await loadSeasonResults(PUBLIC_CLUB_LEAGUES.map(l => l.id), season - 1, cutoff);
  const { index, cacheKeys, batches } = await loadCachedSeasonPhases(results.matches);
  const summaries = PUBLIC_CLUB_LEAGUES.flatMap(l => [season - 1, season].map(s => ({
    name: l.name, ...summarizeSeasonPhases(results.matches, index, l.id, s),
  })));
  const labels = new Map<string, number>();
  for (const match of results.matches) for (const evidence of index.get(match.fixtureId).evidence) {
    const key = `${evidence.phase}: ${evidence.round.replace(/ - \d+$/, "")}`;
    labels.set(key, (labels.get(key) ?? 0) + 1);
  }
  console.log(JSON.stringify({ cutoff, method: "CACHED_FIXTURE_PHASE_AUDIT_V1", cacheKeys, batches,
    rejectedIdentity: index.rejectedIdentity, results: results.matches.length,
    summaries, labels: Object.fromEntries(labels),
    limitations: ["Reconstructed metadata, not guaranteed historical availability.", "Cache unions do not prove exhaustive season coverage.", "Only explicit regular-season rounds qualify for the proposed baseline scope; all unknowns remain excluded."] }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
