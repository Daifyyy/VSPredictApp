import { describe, expect, it } from "vitest";
import { commitmentState, diminishingMagnitude, effectAppliedTotal, weightedForm } from "./causal";
import { roundRobinSchedule, tableRows } from "./season";

describe("kauzální svět ředitele", () => {
  it("rozkládá vliv do času a skončí přesně na celkové velikosti", () => {
    const effect = { magnitude: 8, confidence: .75, startDay: 2, endDay: 5, decay: "LINEAR" as const };
    expect(effectAppliedTotal(effect, 1)).toBe(0);
    expect(effectAppliedTotal(effect, 2)).toBeCloseTo(1.5);
    expect(effectAppliedTotal(effect, 5)).toBeCloseTo(6);
  });

  it("opakované stejné zásahy mají klesající účinek", () => {
    expect(diminishingMagnitude(6, 0)).toBe(6);
    expect(diminishingMagnitude(6, 3)).toBeLessThan(diminishingMagnitude(6, 1));
  });

  it("závazek rozlišuje plnění, riziko a porušení", () => {
    expect(commitmentState({ value: 8, target: 8, tolerance: 0, dueDay: 10, day: 5 })).toBe("ON_TRACK");
    expect(commitmentState({ value: 2, target: 10, tolerance: 0, dueDay: 10, day: 5 })).toBe("AT_RISK");
    expect(commitmentState({ value: 2, target: 10, tolerance: 0, dueDay: 10, day: 10 })).toBe("BROKEN");
  });

  it("forma zohledňuje výkon i sílu soupeře", () => {
    const strongPerformance = weightedForm([{ points: 1, xgFor: 2.1, xgAgainst: .7, opponentStrength: 80 }]);
    const luckyWin = weightedForm([{ points: 3, xgFor: .4, xgAgainst: 2, opponentStrength: 45 }]);
    expect(strongPerformance).toBeGreaterThan(luckyWin);
  });

  it("vytvoří úplný dvoukolový rozpis bez kolize klubů v kole", () => {
    const schedule = roundRobinSchedule(["a", "b", "c", "d"]);
    expect(schedule).toHaveLength(12);
    for (const round of new Set(schedule.map((item) => item.round))) {
      const clubs = schedule.filter((item) => item.round === round).flatMap((item) => [item.homeClubId, item.awayClubId]);
      expect(new Set(clubs).size).toBe(clubs.length);
    }
  });

  it("sestaví tabulku z odehraných utkání", () => {
    const clubs = [{ id: "a" }, { id: "b" }] as never;
    const matches = [{ status: "PLAYED", homeClubId: "a", awayClubId: "b", homeGoals: 2, awayGoals: 1, homeXg: 1.5, awayXg: .8 }] as never;
    const rows = tableRows(clubs, matches);
    expect(rows[0]).toMatchObject({ clubId: "a", points: 3, wins: 1 });
    expect(rows[1]).toMatchObject({ clubId: "b", points: 0, losses: 1 });
  });
});
