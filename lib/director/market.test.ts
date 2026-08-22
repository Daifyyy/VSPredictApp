import { describe, expect, it } from "vitest";
import { cashFlowProjection, contractOfferUtility, dynamicMarketValue, scoutingSnapshot } from "./market";

describe("director transfer market v6", () => {
  it("udržuje hodnotu hráče v realistických mezích podle věku a smlouvy", () => {
    const young = dynamicMarketValue({ ability: 72, potential: 86, age: 20, form: 58, contractYears: 4, reputation: 72, interest: 35, cashPressure: 0 });
    const veteran = dynamicMarketValue({ ability: 72, potential: 72, age: 34, form: 58, contractYears: 1, reputation: 72, interest: 5, cashPressure: .5 });
    expect(young).toBeGreaterThan(veteran);
    expect(young).toBeLessThan(250_000_000);
    expect(veteran).toBeGreaterThanOrEqual(50_000);
  });

  it("lepší scouting zužuje odhad a zůstává deterministický", () => {
    const base = { seed: 42, day: 12, playerId: "player", ability: 68, potential: 79, value: 3_000_000, wage: 18_000, tacticalFit: 71 };
    const weak = scoutingSnapshot({ ...base, scoutingQuality: 25 });
    const strong = scoutingSnapshot({ ...base, scoutingQuality: 85 });
    expect(strong).toEqual(scoutingSnapshot({ ...base, scoutingQuality: 85 }));
    expect(strong.abilityMax - strong.abilityMin).toBeLessThan(weak.abilityMax - weak.abilityMin);
    expect(strong.completeness).toBeGreaterThan(weak.completeness);
  });

  it("agent hodnotí smlouvu jako celek, nikoliv jediný mzdový práh", () => {
    const common = { expectedWage: 20_000, years: 4, desiredYears: 4, promisedShare: .6, desiredShare: .55, clubReputation: 75, currentReputation: 65, competition: 70, alternatives: 0, agentAmbition: 55, credibility: 70 };
    const balanced = contractOfferUtility({ ...common, wage: 26_000, signingBonus: 500_000, agentFee: 100_000 });
    const weak = contractOfferUtility({ ...common, wage: 12_000, signingBonus: 0, agentFee: 0, promisedShare: .2 });
    expect(balanced.accepted).toBe(true);
    expect(weak.accepted).toBe(false);
    expect(weak.reason.length).toBeGreaterThan(10);
  });

  it("odmítne transakci, která vyčerpá budoucí cash flow", () => {
    const safe = cashFlowProjection({ cash: 5_000_000, reservedCash: 500_000, weeklyWages: 200_000, wageBudget: 230_000, upfront: 1_000_000, signingBonus: 100_000, agentFee: 50_000, futurePayments: [400_000, 400_000], incoming: [300_000] });
    const unsafe = cashFlowProjection({ cash: 1_000_000, reservedCash: 500_000, weeklyWages: 240_000, wageBudget: 200_000, upfront: 800_000, signingBonus: 200_000, agentFee: 100_000, futurePayments: [900_000], incoming: [] });
    expect(safe.sustainable).toBe(true);
    expect(unsafe.sustainable).toBe(false);
    expect(unsafe.worst).toBeLessThan(0);
  });
});
