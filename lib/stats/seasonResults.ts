/** Canonical, reconstructed results. Not a claim of historical ingestion-time availability. */
export interface SeasonResultInput {
  fixtureId: number;
  leagueId: number;
  season: number;
  kickoff: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  context: string;
  source: "COMPLETED_ELO_HISTORY" | "SETTLED_PREDICTION";
  status?: string;
}
export type SeasonResult = SeasonResultInput & { homeGoals: number; awayGoals: number };

/** Conflicting copies are quarantined, never resolved by query order or counted twice. */
export function canonicalSeasonResults(rows: SeasonResultInput[], asOf: Date) {
  if (!Number.isFinite(asOf.getTime())) throw new Error("Invalid results cutoff");
  const groups = new Map<number, SeasonResultInput[]>();
  for (const row of rows) groups.set(row.fixtureId, [...(groups.get(row.fixtureId) ?? []), row]);
  const matches: SeasonResult[] = [];
  const rejected: Array<{ fixtureId: number; reason: string }> = [];
  let duplicateRows = 0;
  for (const [fixtureId, copies] of groups) {
    duplicateRows += copies.length - 1;
    const signature = (r: SeasonResultInput) => JSON.stringify([
      r.leagueId, r.season, r.kickoff.getTime(), r.homeTeamId, r.awayTeamId,
      r.homeGoals, r.awayGoals, r.context,
    ]);
    const valid = copies.every(r =>
      r.context === "LEAGUE" && Number.isInteger(r.fixtureId) && r.fixtureId > 0 &&
      Number.isInteger(r.leagueId) && r.leagueId > 0 && Number.isInteger(r.season) &&
      Number.isInteger(r.homeTeamId) && r.homeTeamId > 0 &&
      Number.isInteger(r.awayTeamId) && r.awayTeamId > 0 && r.homeTeamId !== r.awayTeamId &&
      r.homeGoals != null && Number.isInteger(r.homeGoals) && r.homeGoals >= 0 &&
      r.awayGoals != null && Number.isInteger(r.awayGoals) && r.awayGoals >= 0 &&
      Number.isFinite(r.kickoff.getTime()) &&
      (r.source === "COMPLETED_ELO_HISTORY" || ["FT", "AET", "PEN"].includes(r.status ?? "")));
    if (!valid) { rejected.push({ fixtureId, reason: "INVALID_OR_NOT_FINAL" }); continue; }
    if (new Set(copies.map(signature)).size !== 1) {
      rejected.push({ fixtureId, reason: "CONFLICTING_RESULTS" }); continue;
    }
    // No completion timestamp in the historical ledger: conservative boundary exclusion.
    // Delayed/postponed history remains reconstructed, not guaranteed point-in-time.
    if (copies[0].kickoff.getTime() + 3 * 3600_000 >= asOf.getTime()) {
      rejected.push({ fixtureId, reason: "TOO_CLOSE_TO_CUTOFF" }); continue;
    }
    const chosen = copies.find(r => r.source === "SETTLED_PREDICTION") ?? copies[0];
    matches.push(chosen as SeasonResult);
  }
  matches.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.fixtureId - b.fixtureId);
  return { method: "UNIQUE_COMPLETED_FIXTURES_V1" as const, matches, rejected, duplicateRows };
}

/** Explicit league/season grain; never estimate missing goals as zero. */
export function seasonResultTotals(matches: SeasonResult[], leagueId: number, season: number, asOf: Date) {
  const selected = matches.filter(r => r.leagueId === leagueId && r.season === season &&
    r.kickoff.getTime() + 3 * 3600_000 < asOf.getTime());
  return {
    matches: selected.length,
    homeGoals: selected.reduce((s, r) => s + r.homeGoals, 0),
    awayGoals: selected.reduce((s, r) => s + r.awayGoals, 0),
    teams: new Set(selected.flatMap(r => [r.homeTeamId, r.awayTeamId])).size,
    coverage: "UNKNOWN" as const, // Cannot infer completeness from observed matches alone.
    phaseCoverage: "UNVERIFIED" as const, // Source ledgers do not preserve regular/playoff rounds.
    productionEligible: false as const,
  };
}
