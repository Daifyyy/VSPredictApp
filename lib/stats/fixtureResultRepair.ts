import type { InventoryFixture } from "./seasonInventory";
export interface RepairableFixture {
  fixtureId: number; leagueId: number; season: number; kickoff: Date;
  homeTeamId: number; awayTeamId: number; homeName: string; awayName: string;
  homeLogo: string; awayLogo: string;
}
/** Correct fixture facts, never swap/recompute a historical prediction or price. */
export function fixtureResultRepair(stored: RepairableFixture, actual: InventoryFixture) {
  if (stored.fixtureId !== actual.fixtureId || !["FT", "AET", "PEN"].includes(actual.status) ||
    !Number.isFinite(Date.parse(actual.kickoff)) ||
    actual.homeGoals == null || !Number.isInteger(actual.homeGoals) || actual.homeGoals < 0 ||
    actual.awayGoals == null || !Number.isInteger(actual.awayGoals) || actual.awayGoals < 0) throw new Error("Invalid final fixture evidence");
  const same = stored.homeTeamId === actual.homeTeamId && stored.awayTeamId === actual.awayTeamId;
  const reversed = stored.homeTeamId === actual.awayTeamId && stored.awayTeamId === actual.homeTeamId;
  if (!same && !reversed) throw new Error("Different team identities require manual investigation");
  return {
    status: actual.status, kickoff: new Date(actual.kickoff),
    homeTeamId: actual.homeTeamId, awayTeamId: actual.awayTeamId,
    homeName: reversed ? stored.awayName : stored.homeName,
    awayName: reversed ? stored.homeName : stored.awayName,
    homeLogo: reversed ? stored.awayLogo : stored.homeLogo,
    awayLogo: reversed ? stored.homeLogo : stored.awayLogo,
    homeGoals: actual.homeGoals, awayGoals: actual.awayGoals,
    // Venue was wrong at prediction time; exclude that forecast from main calibration.
    ...(reversed ? { available: false, lowConfidence: true } : {}),
  };
}
