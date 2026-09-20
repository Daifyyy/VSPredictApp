import { classifyCompetitionRound } from "./seasonPhases";
import type { SeasonResult } from "./seasonResults";
export interface InventoryFixture {
  fixtureId: number; kickoff: string; homeTeamId: number; awayTeamId: number;
  status: string; round: string | null; homeGoals: number | null; awayGoals: number | null;
}
export interface SeasonInventory {
  version: number; source: string; leagueId: number; season: number; fetchedAt: string;
  apiAttempts: number; count: number; sha256: string;
  pagination: { current: number; total: number }; fixtures: InventoryFixture[];
}

/** Fresh provider inventory vs stored results. Never mutates either source. */
export function reconcileSeasonInventory(inventory: SeasonInventory, local: SeasonResult[], cutoff: Date) {
  if (!Number.isFinite(cutoff.getTime())) throw new Error("Invalid inventory cutoff");
  if (inventory.version !== 1 || inventory.pagination.current !== 1 || inventory.pagination.total !== 1 ||
      inventory.count !== inventory.fixtures.length || !inventory.count ||
      new Set(inventory.fixtures.map(r => r.fixtureId)).size !== inventory.count) throw new Error("Incomplete inventory");
  const beforeCutoff = (kickoff: string | Date) => new Date(kickoff).getTime() + 3 * 3600_000 < cutoff.getTime();
  const finished = inventory.fixtures.filter(r => beforeCutoff(r.kickoff) && ["FT", "AET", "PEN"].includes(r.status));
  const stored = local.filter(r => r.leagueId === inventory.leagueId && r.season === inventory.season && beforeCutoff(r.kickoff));
  const index = new Map(stored.map(r => [r.fixtureId, r]));
  const ids = new Set(finished.map(r => r.fixtureId));
  const missingLocal: number[] = [], missingScore: number[] = [], unknownPhase: number[] = [];
  const scoreConflicts: Array<{ fixtureId: number; stored: number[]; provider: Array<number | null> }> = [];
  const identityConflicts: number[] = [];
  const phases: Record<string, number> = {};
  let matching = 0;
  for (const row of finished) {
    const phase = classifyCompetitionRound(row.round);
    phases[phase] = (phases[phase] ?? 0) + 1;
    if (phase === "UNKNOWN") unknownPhase.push(row.fixtureId);
    if (row.homeGoals === null || row.awayGoals === null) missingScore.push(row.fixtureId);
    const old = index.get(row.fixtureId);
    if (!old) { missingLocal.push(row.fixtureId); continue; }
    if (old.homeTeamId !== row.homeTeamId || old.awayTeamId !== row.awayTeamId || old.kickoff.getTime() !== Date.parse(row.kickoff)) {
      identityConflicts.push(row.fixtureId); continue;
    }
    if (old.homeGoals !== row.homeGoals || old.awayGoals !== row.awayGoals) {
      scoreConflicts.push({ fixtureId: row.fixtureId, stored: [old.homeGoals, old.awayGoals], provider: [row.homeGoals, row.awayGoals] }); continue;
    }
    matching++;
  }
  const localOnly = stored.filter(r => !ids.has(r.fixtureId)).map(r => ({ fixtureId: r.fixtureId,
    providerStatus: inventory.fixtures.find(p => p.fixtureId === r.fixtureId)?.status ?? "ABSENT" }));
  return { leagueId: inventory.leagueId, season: inventory.season, inventoryCount: inventory.count,
    finishedBeforeCutoff: finished.length, localCount: stored.length, matching, phases,
    missingLocal, missingScore, unknownPhase, scoreConflicts, identityConflicts, localOnly,
    agreementCoverage: finished.length ? matching / finished.length : null,
    inventoryCompleteAsReportedByProvider: true,
    dataReconciled: finished.length > 0 && ![missingLocal, missingScore, unknownPhase, scoreConflicts, identityConflicts, localOnly].some(a => a.length),
    productionEligible: false, // Data reconciliation is not model calibration/activation approval.
  };
}
