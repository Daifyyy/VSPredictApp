import { describe, expect, it } from "vitest";
import { boardReview, informationQuality, playerExpectation, transferOfferUtility, transferWindow } from "./people";

describe("director people and market v3", () => {
  it("hodnotí slíbenou roli pouze z dostupných soutěžních minut", () => {
    const patient = playerExpectation({ promisedRole: "STARTER", appearances: 2, minutes: 150, availableTeamMatches: 3, injuryDays: 0, currentStage: 0, morale: 60 });
    expect(patient.status).toBe("LITTLE_DATA");
    const unhappy = playerExpectation({ promisedRole: "STARTER", appearances: 2, minutes: 160, availableTeamMatches: 7, injuryDays: 0, currentStage: 2, morale: 55 });
    expect(unhappy.status).toBe("AGENT_MEETING");
    expect(unhappy.nextStage).toBe(3);
  });

  it("odděluje dohodu od registračního období", () => {
    const rules = { transferWindows: [{ name: "léto", start: 0, end: 20 }, { name: "zima", start: 80, end: 94 }] };
    expect(transferWindow(12, rules)).toMatchObject({ open: true, registrationDay: 12 });
    expect(transferWindow(40, rules)).toMatchObject({ open: false, registrationDay: 80 });
  });

  it("nepoužívá jediný cenový práh pro přestup", () => {
    const base = { marketValue: 1_000_000, upfront: 900_000, installments: 200_000, bonuses: 100_000, sellOn: 10, importance: .5, sellerCashPressure: .7, replacementDifficulty: .2, rivalry: 0, offeredWage: 20_000, currentWage: 14_000, offeredYears: 4, targetYears: 4, roleFit: 1, clubAmbitionFit: 1 };
    expect(transferOfferUtility(base).accepted).toBe(true);
    expect(transferOfferUtility({ ...base, replacementDifficulty: 1, importance: 1, roleFit: .5 }).accepted).toBe(false);
  });

  it("kvalita zaměstnance mění nejistotu, nikoli skutečný výkon", () => {
    expect(informationQuality([], "SCOUTING").uncertainty).toBe("VERY_HIGH");
    expect(informationQuality([{ role: "SCOUTING", ability: 90, workload: 20, status: "ACTIVE" }], "SCOUTING").uncertainty).toBe("LOW");
  });

  it("rada hodnotí relativní sportovní a finanční kontext", () => {
    const strong = boardReview({ position: 2, clubs: 16, expectedPosition: 7, expectedPoints: 42, actualPoints: 55, cash: 2_000_000, liabilities: 200_000, youthMinutes: 1200, academyTarget: 900, completedProjects: 1 });
    const weak = boardReview({ position: 14, clubs: 16, expectedPosition: 7, expectedPoints: 42, actualPoints: 25, cash: -300_000, liabilities: 900_000, youthMinutes: 100, academyTarget: 900, completedProjects: 0 });
    expect(strong.overall).toBeGreaterThan(weak.overall);
    expect(weak.outcome).toMatch(/WARNING|DISMISSAL/);
  });
});
