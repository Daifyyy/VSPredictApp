import { describe, expect, it } from "vitest";
import { buildTacticalProfile, type TacticalMatch } from "./tactics";

function match(fixtureId: number, formation: string, isHome: boolean, coachName = "A. Trenér"): TacticalMatch {
  return { fixtureId, formation, isHome, coachId: 1, coachName, coachPhoto: null, date: `2026-08-${String(fixtureId).padStart(2, "0")}T18:00:00Z` };
}

describe("buildTacticalProfile", () => {
  it("určí nejčastější formaci, venue varianty, stabilitu a trenéra", () => {
    const profile = buildTacticalProfile([
      match(10, "4-2-3-1", true), match(9, "4-2-3-1", false), match(8, "4-3-3", true), match(7, "4-2-3-1", false),
    ]);
    expect(profile.primaryFormation).toBe("4-2-3-1");
    expect(profile.homeFormation).toBe("4-2-3-1");
    expect(profile.awayFormation).toBe("4-2-3-1");
    expect(profile.stability).toBe(0.75);
    expect(profile.defensiveLine).toBe("BACK_FOUR");
    expect(profile.coach).toMatchObject({ name: "A. Trenér", matchesInSample: 4 });
  });

  it("rozpozná změnu posledního systému a respektuje limit", () => {
    const profile = buildTacticalProfile([
      match(10, "3-4-2-1", true), match(9, "3-4-2-1", false), match(8, "3-5-2", true),
      match(7, "4-3-3", false), match(6, "4-3-3", true), match(5, "4-3-3", false),
    ], 5);
    expect(profile.sampleSize).toBe(5);
    expect(profile.recentChange).toBe(true);
    expect(profile.defensiveLine).toBe("BACK_THREE");
  });

  it("vrátí bezpečný prázdný profil", () => {
    expect(buildTacticalProfile([])).toMatchObject({ sampleSize: 0, primaryFormation: null, coach: null });
  });
});
