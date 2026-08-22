import { describe, expect, it } from "vitest";
import { chooseMicrocycle, defaultCoachMemory, evolveRoleFamiliarity, medicalState, normalizePhaseBudget, systemCosts, updateCoachMemory } from "./adaptation";
import { defaultSportingPolicy, PHASES } from "./sporting";

describe("director adaptation v5", () => {
  it("keeps a fixed tactical budget", () => {
    const phases = normalizePhaseBudget({ BUILDUP: 90, PRESSING: 70, TRANSITION: 20, BLOCK: 40, SET_PIECES: 55, DISCIPLINE: 65 });
    expect(PHASES.reduce((sum, phase) => sum + phases[phase], 0)).toBeCloseTo(300, 6);
    expect(Object.values(phases).every((value) => value >= 25 && value <= 75)).toBe(true);
  });

  it("adapts by redistribution rather than a permanent bonus", () => {
    const previous = defaultCoachMemory();
    const result = updateCoachMemory({ previous, evidence: [{ day: 8, phases: { PRESSING: 35, BUILDUP: 70 }, xgFor: .8, xgAgainst: 1.7, points: 0, opponentStrength: 65, ownStrength: 62, formation: "4-3-3", style: "HIGH_PRESS" }], adaptability: 72, analyticsQuality: 80, seed: 42 });
    expect(result.adaptation.netChange).toBe(0);
    expect(PHASES.reduce((sum, phase) => sum + result.memory.phaseAssessment[phase], 0)).toBeCloseTo(300, 6);
  });

  it("charges cohesion for system changes and makes repetition readable", () => {
    const previous = { ...defaultCoachMemory(), lastFormation: "4-4-2", lastStyle: "DEEP_BLOCK", recentPlans: Array.from({ length: 4 }, (_, day) => ({ day, formation: "4-3-3", style: "HIGH_PRESS", phases: defaultCoachMemory().phaseAssessment, performance: 0 })) };
    const changed = systemCosts({ previous, formation: "4-3-3", style: "HIGH_PRESS", phases: previous.phaseAssessment });
    expect(changed.cohesionCost).toBeGreaterThan(0);
    expect(changed.predictability).toBeGreaterThan(0);
  });

  it("reduces load in congested schedules", () => {
    const policy = defaultSportingPolicy();
    const calm = chooseMicrocycle({ daysToMatch: 4, daysSinceMatch: 5, matchesNextSevenDays: 1, policy, coachRiskBias: 0 });
    const congested = chooseMicrocycle({ daysToMatch: 1, daysSinceMatch: 1, matchesNextSevenDays: 4, policy, coachRiskBias: 0 });
    expect(congested.intensity).toBeLessThan(calm.intensity);
  });

  it("limits returning players and models recurrence risk", () => {
    const state = medicalState({ injuryDays: 0, fitness: 68, acuteLoad: 35, chronicLoad: 30, previousStatus: "ACUTE_INJURY", currentDay: 20, medicalInformationQuality: 75 });
    expect(state.status).toBe("RETURNING");
    expect(state.minutesLimit).toBeGreaterThanOrEqual(20);
    expect(state.recurrenceRisk).toBeGreaterThan(0);
  });

  it("learns used roles and slowly forgets unused ones", () => {
    const next = evolveRoleFamiliarity({ familiarity: { CREATOR: 60, BALL_WINNER: 60 }, usedRole: "CREATOR", minutes: 90, tacticalTraining: true });
    expect(next.CREATOR).toBeGreaterThan(60);
    expect(next.BALL_WINNER).toBeLessThan(60);
  });

  it("does not accumulate tactical strength across fifty seasons", () => {
    let memory = defaultCoachMemory();
    const leaders = new Set<string>();
    for (let season = 0; season < 50; season++) {
      for (let match = 0; match < 34; match++) {
        const phase = PHASES[(season + match) % PHASES.length];
        const result = updateCoachMemory({ previous: memory, evidence: [{ day: season * 34 + match, phases: { [phase]: 35 }, xgFor: .8 + (match % 4) * .2, xgAgainst: 1.4, points: match % 3, opponentStrength: 60 + match % 10, ownStrength: 64, formation: match % 7 ? "4-3-3" : "3-4-2-1", style: match % 5 ? "BALANCED" : "HIGH_PRESS" }], adaptability: 75, analyticsQuality: 70, seed: 1000 + season });
        memory = result.memory;
        leaders.add(PHASES.slice().sort((a, b) => memory.phaseAssessment[b] - memory.phaseAssessment[a])[0]);
        expect(PHASES.reduce((sum, item) => sum + memory.phaseAssessment[item], 0)).toBeCloseTo(300, 5);
      }
    }
    expect(Math.max(...Object.values(memory.phaseAssessment))).toBeLessThanOrEqual(75);
    expect(leaders.size).toBeGreaterThan(1);
  });
});
