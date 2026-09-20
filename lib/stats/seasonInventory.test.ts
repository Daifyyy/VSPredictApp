import { describe, expect, it } from "vitest";
import { reconcileSeasonInventory, type SeasonInventory } from "./seasonInventory";
import type { SeasonResult } from "./seasonResults";
const date = new Date("2026-09-20T00:00:00Z");
const fixture = { fixtureId: 1, kickoff: "2026-09-18T12:00:00Z", homeTeamId: 1, awayTeamId: 2, status: "FT", round: "Regular Season - 1", homeGoals: 0, awayGoals: 1 };
const inventory: SeasonInventory = { version: 1, source: "test", leagueId: 39, season: 2026, fetchedAt: date.toISOString(), apiAttempts: 1, count: 1, sha256: "test", pagination: { current: 1, total: 1 }, fixtures: [fixture] };
const local: SeasonResult = { ...fixture, kickoff: new Date(fixture.kickoff), leagueId: 39, season: 2026, context: "LEAGUE", source: "COMPLETED_ELO_HISTORY" };
describe("season inventory reconciliation", () => {
  it("reconciles without authorizing production activation", () => {
    expect(reconcileSeasonInventory(inventory, [local], date)).toMatchObject({ dataReconciled: true, productionEligible: false, agreementCoverage: 1 });
  });
  it("distinguishes missing records, score corrections and unknown phases", () => {
    expect(reconcileSeasonInventory(inventory, [], date).missingLocal).toEqual([1]);
    expect(reconcileSeasonInventory(inventory, [{ ...local, homeGoals: 2 }], date).scoreConflicts).toHaveLength(1);
    const changed = { ...inventory, fixtures: [{ ...fixture, round: null, homeGoals: null }] };
    expect(reconcileSeasonInventory(changed, [local], date)).toMatchObject({ unknownPhase: [1], missingScore: [1], dataReconciled: false });
  });
  it("does not count future or live fixtures as missing results", () => {
    const changed = { ...inventory, count: 3, fixtures: [fixture, { ...fixture, fixtureId: 2, status: "2H" }, { ...fixture, fixtureId: 3, kickoff: date.toISOString() }] };
    expect(reconcileSeasonInventory(changed, [local], date)).toMatchObject({ finishedBeforeCutoff: 1, dataReconciled: true });
  });
  it("rejects duplicates/pagination and flags identity or final status disagreement", () => {
    expect(() => reconcileSeasonInventory({ ...inventory, count: 2, fixtures: [fixture, fixture] }, [], date)).toThrow();
    expect(() => reconcileSeasonInventory({ ...inventory, pagination: { current: 1, total: 2 } }, [], date)).toThrow();
    expect(reconcileSeasonInventory(inventory, [{ ...local, homeTeamId: 5 }], date).identityConflicts).toEqual([1]);
    expect(reconcileSeasonInventory({ ...inventory, fixtures: [{ ...fixture, status: "PST" }] }, [local], date).localOnly).toEqual([{ fixtureId: 1, providerStatus: "PST" }]);
  });
});
