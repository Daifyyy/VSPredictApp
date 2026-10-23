import { classifyCompetitionRound } from '../stats/seasonPhases';
import type { InventoryFixture } from '../stats/seasonInventory';

export interface AIArchiveRow {
  fixtureId: number; date: string; leagueId: number; season: number;
  homeId: number; awayId: number; homeGoals: number; awayGoals: number;
}
type Stats = Record<string, { home?: Record<string, number>; away?: Record<string, number> }>;
const metrics = ['XG', 'SHOTS', 'SHOTS_ON_TARGET', 'SHOTS_INSIDE_BOX', 'CORNERS'] as const;
function complete(side?: Record<string, number>) {
  return !!side && metrics.every(k => Number.isFinite(side[k]) && side[k] >= 0 && (k === 'XG' || Number.isInteger(side[k])))
    && side.SHOTS_ON_TARGET <= side.SHOTS && side.SHOTS_INSIDE_BOX <= side.SHOTS;
}

/** Joining archives does not prove original publication time or neutral-venue status. */
export function reconcileAIArchive(rows: AIArchiveRow[], stats: Stats, leagueId: number, season: number, inventory?: InventoryFixture[]) {
  if (!Array.isArray(rows) || !stats || Array.isArray(stats) || typeof stats !== 'object') throw Error('INVALID_ARCHIVE_SHAPE');
  if (inventory && new Set(inventory.map(f => f.fixtureId)).size !== inventory.length) throw Error('DUPLICATE_INVENTORY_FIXTURE');
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.fixtureId, (counts.get(r.fixtureId) ?? 0) + 1);
  const byId = new Map(inventory?.map(f => [f.fixtureId, f]));
  const classified = rows.map(r => {
    const reasons: string[] = [];
    if (![r.fixtureId, r.homeId, r.awayId].every(n => Number.isInteger(n) && n > 0) || r.homeId === r.awayId
      || ![r.homeGoals, r.awayGoals].every(n => Number.isInteger(n) && n >= 0)
      || !Number.isFinite(Date.parse(r.date)) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.date)) reasons.push('INVALID_IDENTITY_RESULT_OR_TIME');
    if (r.leagueId !== leagueId || r.season !== season) reasons.push('SOURCE_SCOPE_MISMATCH');
    if (counts.get(r.fixtureId)! > 1) reasons.push('DUPLICATE_FIXTURE');
    const f = byId.get(r.fixtureId);
    if (!inventory) reasons.push('NO_VERIFIED_INVENTORY');
    else if (!f) reasons.push('ABSENT_FROM_INVENTORY');
    else {
      if (f.homeTeamId !== r.homeId || f.awayTeamId !== r.awayId || Date.parse(f.kickoff) !== Date.parse(r.date)) reasons.push('IDENTITY_CONFLICT');
      if (f.homeGoals !== r.homeGoals || f.awayGoals !== r.awayGoals) reasons.push('RESULT_CONFLICT');
      if (f.status !== 'FT' || classifyCompetitionRound(f.round) !== 'REGULAR_SEASON') reasons.push('NOT_REGULAR_FT');
    }
    const s = stats[String(r.fixtureId)];
    const advancedStatsComplete = complete(s?.home) && complete(s?.away);
    return { fixtureId: r.fixtureId, reasons, advancedStatsComplete,
      reconciled: reasons.length === 0, sourceTimingVerified: false, trainingAllowed: false };
  });
  const reasons: Record<string, number> = {};
  for (const r of classified) for (const reason of r.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  const ids = new Set(rows.map(r => String(r.fixtureId)));
  const inventoryOnlyRegularFT = inventory?.filter(f => f.status === 'FT'
    && classifyCompetitionRound(f.round) === 'REGULAR_SEASON' && !ids.has(String(f.fixtureId))).map(f => f.fixtureId) ?? [];
  return { leagueId, season, rows: rows.length, uniqueFixtures: counts.size,
    reconciled: classified.filter(r => r.reconciled).length,
    completeAdvancedStats: classified.filter(r => r.advancedStatsComplete).length,
    reconciledWithAdvancedStats: classified.filter(r => r.reconciled && r.advancedStatsComplete).length,
    orphanStats: Object.keys(stats).filter(id => !ids.has(id)).length, inventoryOnlyRegularFT, reasons, classified };
}
