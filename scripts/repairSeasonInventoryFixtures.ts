// Explicitly scoped repair, no provider requests. Default dry-run; --apply writes audit + facts.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { fixtureResultRepair } from "../lib/stats/fixtureResultRepair";
import type { SeasonInventory } from "../lib/stats/seasonInventory";
import { settleAutonomousPortfolio } from "../lib/data/autonomousPortfolioStore";
import { settleQuickOverviewSelections } from "../lib/data/quickOverviewStore";
import { settleIntuitionTickets } from "../lib/data/intuitionTicketStore";
import { settleMatchFlowEvaluation } from "../lib/data/matchFlowStore";
const targets = [{ fixtureId: 1570385, leagueId: 140 }, { fixtureId: 1552735, leagueId: 61 }, { fixtureId: 1558582, leagueId: 144 }];
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
async function main() {
  const evidence = targets.map(target => {
    const inventory = JSON.parse(readFileSync(`.cache/season-inventories/2026-09-20-${target.leagueId}-2026.json`, "utf8")) as SeasonInventory;
    if (createHash("sha256").update(JSON.stringify(inventory.fixtures)).digest("hex") !== inventory.sha256 || inventory.leagueId !== target.leagueId || inventory.season !== 2026) throw new Error("Inventory integrity mismatch");
    const actual = inventory.fixtures.find(r => r.fixtureId === target.fixtureId);
    if (!actual) throw new Error("Missing inventory evidence");
    return { ...target, actual, hash: inventory.sha256 };
  });
  const apply = process.argv.includes("--apply");
  const results = await prisma.$transaction(async tx => {
    const changes = [];
    for (const entry of evidence) {
      const before = await tx.fixturePrediction.findUniqueOrThrow({ where: { fixtureId: entry.fixtureId }, omit: { oddsSeries: true, oddsBooks: true, oddsCurrentBooks: true, oddsCloseBooks: true } });
      if (before.leagueId !== entry.leagueId || before.season !== 2026) throw new Error("Unexpected fixture scope");
      const data = fixtureResultRepair(before, entry.actual);
      const stats = await tx.matchStatCache.findMany({ where: { fixtureId: entry.fixtureId, context: "league" } });
      for (const teamId of [entry.actual.homeTeamId, entry.actual.awayTeamId]) {
        const row = stats.find(r => r.teamId === teamId), home = teamId === entry.actual.homeTeamId;
        if (!row || row.isHome !== home || row.date.getTime() !== Date.parse(entry.actual.kickoff) ||
            row.goalsFor !== (home ? entry.actual.homeGoals : entry.actual.awayGoals) || row.goalsAgainst !== (home ? entry.actual.awayGoals : entry.actual.homeGoals)) throw new Error(`Stored team statistics do not corroborate ${entry.fixtureId}`);
      }
      const fingerprint = `season-inventory-repair:v1:${entry.fixtureId}`;
      const audited = await tx.dataIncident.findUnique({ where: { fingerprint } });
      if (audited) {
        if (before.status !== data.status || before.kickoff.getTime() !== data.kickoff.getTime() || before.homeTeamId !== data.homeTeamId || before.awayTeamId !== data.awayTeamId || before.homeGoals !== data.homeGoals || before.awayGoals !== data.awayGoals) throw new Error("Repaired fixture drifted; manual review required");
        changes.push({ fixtureId: entry.fixtureId, status: "ALREADY_REPAIRED" }); continue;
      }
      const oldElo = await tx.clubEloMatch.findUnique({ where: { fixtureId: entry.fixtureId } });
      changes.push({ fixtureId: entry.fixtureId, status: apply ? "REPAIRED" : "DRY_RUN", data });
      if (!apply) continue;
      await tx.dataIncident.create({ data: { fingerprint, kind: "SEASON_RESULT_CORRECTION", severity: "WARN", status: "RESOLVED", resolvedAt: new Date(),
        message: entry.fixtureId === 1552735 ? "Corrected reversed venue; original forecast preserved in audit and excluded from main calibration." : "Corrected fixture facts from complete provider inventory and corroborating stored team statistics.",
        details: json({ inventoryHash: entry.hash, before, beforeElo: oldElo, applied: data, preservedPrediction: true }) } });
      await tx.fixturePrediction.update({ where: { fixtureId: entry.fixtureId }, data: { ...data, settledAt: before.settledAt ?? new Date() } });
      const elo = { leagueId: entry.leagueId, season: 2026, kickoff: data.kickoff, homeTeamId: data.homeTeamId, awayTeamId: data.awayTeamId, homeGoals: data.homeGoals, awayGoals: data.awayGoals, context: "LEAGUE" };
      await tx.clubEloMatch.upsert({ where: { fixtureId: entry.fixtureId }, create: { fixtureId: entry.fixtureId, ...elo }, update: elo });
    }
    return changes;
  }, { timeout: 60_000 });
  console.log(JSON.stringify({ apply, results }));
  if (apply) {
    // Only the previously unfinished fixture; established historical ticket selections stay frozen.
    const at = new Date(), id = 1570385;
    console.log(JSON.stringify({ settlement: {
      quickOverview: await settleQuickOverviewSelections(id, 7, 2, at),
      tickets: await settleIntuitionTickets(id, 7, 2, at),
      autonomous: await settleAutonomousPortfolio(id, at),
      matchFlow: await settleMatchFlowEvaluation(id, at),
    } }));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
