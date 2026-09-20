// Read-only replay of approved local imports. Never calls the provider.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { prisma } from "../lib/db";
import { PUBLIC_CLUB_LEAGUES } from "../lib/data/catalog";
import { loadSeasonResults } from "../lib/data/seasonResults";
import { reconcileSeasonInventory, type SeasonInventory } from "../lib/stats/seasonInventory";
async function main() {
  const cutoff = new Date("2026-09-20T00:00:00Z");
  const local = await loadSeasonResults(PUBLIC_CLUB_LEAGUES.map(l => l.id), 2025, cutoff);
  const reports = [];
  for (const league of PUBLIC_CLUB_LEAGUES) for (const season of [2025, 2026]) {
    const path = join(process.cwd(), ".cache", "season-inventories", `2026-09-20-${league.id}-${season}.json`);
    const inventory = JSON.parse(readFileSync(path, "utf8")) as SeasonInventory;
    if (inventory.leagueId !== league.id || inventory.season !== season || inventory.source !== "API_FOOTBALL_LEAGUE_SEASON_FIXTURES" ||
        createHash("sha256").update(JSON.stringify(inventory.fixtures)).digest("hex") !== inventory.sha256) throw new Error(`Invalid inventory ${league.id}/${season}`);
    reports.push({ name: league.name, hash: inventory.sha256, fetchedAt: inventory.fetchedAt,
      ...reconcileSeasonInventory(inventory, local.matches, cutoff) });
  }
  console.log(JSON.stringify({ cutoff, method: "SEASON_INVENTORY_RECONCILIATION_V1", reports,
    quarantinedLocal: local.rejected,
    limitations: ["Provider-as-reported inventory, not proof of historical ingestion-time availability.", "Future fixtures and non-final statuses are not treated as missing results.", "No production data corrected and no calibration activated."] }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
