import { describe, expect, it } from "vitest";
import { academyDevelopment, attendanceDemand, identityProfile, projectShock, projectStudy, sponsorOfferValue } from "./infrastructure";

describe("director infrastructure world v7", () => {
  it("vytváří deterministickou studii s cenovým intervalem a rezervou", () => {
    const a = projectStudy("NEW_STADIUM", 42, 10, .7); const b = projectStudy("NEW_STADIUM", 42, 10, .7);
    expect(a).toEqual(b); expect(a.estimate).toBeGreaterThanOrEqual(a.costMin); expect(a.estimate).toBeLessThanOrEqual(a.costMax); expect(a.contingency).toBeGreaterThan(0); expect(a.temporaryCapacityRatio).toBeLessThan(1);
  });

  it("riziko stavby je seedované a nemůže vytvořit libovolný extrém", () => {
    const results = Array.from({ length: 100 }, (_, day) => projectShock({ seed: 91, projectId: "stadium", day, confidence: .55, spent: 2_000_000, approvedCost: 10_000_000 })).filter(Boolean);
    expect(results.length).toBeGreaterThan(0); expect(results.every((item) => item!.overrun <= 900_000 && item!.delay <= 8)).toBe(true);
  });

  it("návštěvnost reaguje rozdílně na cenu a nikdy nepřekročí kapacitu", () => {
    const segments = [{ kind: "CORE", size: 4_000, trust: 70, priceSensitivity: .3, sportingSensitivity: .6 }, { kind: "FAMILY", size: 6_000, trust: 65, priceSensitivity: .95, sportingSensitivity: .3 }];
    const cheap = attendanceDemand({ capacity: 9_000, standardPrice: 18, opponentAppeal: 60, form: 2, comfort: 60, safety: 70, access: 60, segments }); const expensive = attendanceDemand({ capacity: 9_000, standardPrice: 42, opponentAppeal: 60, form: 2, comfort: 60, safety: 70, access: 60, segments });
    expect(cheap.attendance).toBeGreaterThan(expensive.attendance); expect(cheap.attendance).toBeLessThanOrEqual(9_000); expect(expensive.bySegment.FAMILY / cheap.bySegment.FAMILY).toBeLessThan(expensive.bySegment.CORE / cheap.bySegment.CORE);
  });

  it("akademie rozvíjí hráče jen v mezích potenciálu a podle minut", () => {
    const low = academyDevelopment({ ability: 55, potential: 78, age: 17, minutes: 100, coaching: 60, facilities: 3, focusFit: 70, seed: 4, playerId: "p", day: 8 }); const high = academyDevelopment({ ability: 55, potential: 78, age: 17, minutes: 900, coaching: 60, facilities: 3, focusFit: 70, seed: 4, playerId: "p", day: 8 });
    expect(high.abilityDelta).toBeGreaterThan(low.abilityDelta); expect(high.abilityDelta).toBeLessThanOrEqual(.22); expect(high.readinessDelta).toBeLessThanOrEqual(2.5);
  });

  it("odděluje deklarovanou identitu od skutečného profilu", () => {
    const profile = identityProfile({ declared: ["ACADEMY", "SUSTAINABLE"], youthShare: .03, localShare: .8, dataTransfers: 1, balanceTrend: -800_000, attackingStyle: 1.4, leaguePosition: 4, commercialRevenue: 120_000, previousChanges: 2 });
    expect(profile.observed.ACADEMY).toBeLessThan(profile.observed.LOCAL); expect(profile.credibility).toBeLessThanOrEqual(profile.alignment); expect(profile.drivers).toHaveLength(2);
  });

  it("kontroverzní sponzor má dohledatelné reputační riziko", () => {
    const safe = sponsorOfferValue({ reputation: 65, attendance: 12_000, onlineReach: 15_000, stability: 70, sponsorBudget: 1_000_000, ethics: 80 }); const risky = sponsorOfferValue({ reputation: 65, attendance: 12_000, onlineReach: 15_000, stability: 70, sponsorBudget: 1_200_000, ethics: 25 });
    expect(risky.guaranteed).toBeGreaterThanOrEqual(safe.guaranteed); expect(risky.reputationalRisk).toBeGreaterThan(safe.reputationalRisk);
  });
});
