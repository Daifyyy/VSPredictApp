import { describe, expect, it } from "vitest";
import { defaultSportingPolicy, meetingDecision, phaseMatchup, prepareSportingPlan, roleScores, trainingUpdate } from "./sporting";
import { simulateMatch } from "../game/simulate";
import { seeded } from "./random";

const coach = { id: "c", formation: "4-3-3", philosophy: "HIGH_PRESS", adaptability: 70, youthDevelopment: 65, matchManagement: 68, interferenceTolerance: 55, relationship: 65, preferredRoles: ["PRESSING_FORWARD"] };
const players = Array.from({ length: 22 }, (_, index) => ({ id: `p${index}`, position: index === 0 || index === 21 ? "GK" : index < 9 ? "CB" : index < 15 ? "CM" : "ST", archetype: index % 2 ? "TECHNICAL" : "PHYSICAL", age: 19 + index % 14, ability: 55 + index % 17, potential: 78, ballSkill: 52 + index % 22, creation: 50 + index % 21, finishing: 48 + index % 24, defending: 50 + (20 - index) % 20, physical: 55 + index % 19, mentality: 57 + index % 17, form: 50 + index % 12, fitness: 82 + index % 13, morale: 60, cohesion: 58, injuryDays: 0, acuteLoad: 22, chronicLoad: 25, matchReadiness: 88 }));

describe("sportovní engine v4", () => {
  it("vytvoří deterministickou jedenáctku, lavičku a role", () => {
    const policy = defaultSportingPolicy("HIGH_PRESS"); const a = prepareSportingPlan({ players, coach, policy, opponentStrength: 64, seed: 7, day: 4 }); const b = prepareSportingPlan({ players, coach, policy, opponentStrength: 64, seed: 7, day: 4 });
    expect(a).toEqual(b); expect(a.lineup).toHaveLength(11); expect(a.bench.length).toBeGreaterThan(0); expect(new Set(a.lineup.map((x) => x.playerId)).size).toBe(11); expect(a.phases.PRESSING).toBeGreaterThan(50);
  });

  it("omezuje taktický vliv, aby nepřevážil kvalitu", () => {
    const base = prepareSportingPlan({ players, coach, policy: defaultSportingPolicy(), opponentStrength: 60, seed: 1, day: 1 }); const extreme = { ...base, phases: { BUILDUP: 90, PRESSING: 90, TRANSITION: 90, BLOCK: 90, SET_PIECES: 90, DISCIPLINE: 90 } };
    const weak = { ...base, phases: { BUILDUP: 25, PRESSING: 25, TRANSITION: 25, BLOCK: 25, SET_PIECES: 25, DISCIPLINE: 25 } }; const duel = phaseMatchup(extreme, weak); expect(duel.homeAttack).toBeLessThanOrEqual(1.15); expect(duel.awayAttack).toBeGreaterThanOrEqual(.85);
  });

  it("počítá roli z konkrétních schopností", () => { const scores = roleScores({ ...players[16], position: "ST", finishing: 90, physical: 85 }); expect(scores.TARGET_FORWARD).toBeGreaterThan(scores.DEEP_PLAYMAKER); });

  it("odlišuje biologické riziko od nejistoty zaměstnance", () => { const update = trainingUpdate({ ...players[4], fitness: 60, acuteLoad: 50, chronicLoad: 24 }, { ...defaultSportingPolicy(), trainingIntensity: .9 }, 4, 9); expect(update.healthRisk).toBeGreaterThan(10); expect(update.matchReadiness).toBeLessThan(80); });

  it("porada respektuje mandát a může podnět upravit či odmítnout", () => { expect(meetingDecision({ choice: "SUPPORT", coach, aligned: true, seed: 1 }).outcome).toBe("ACCEPTED"); expect(meetingDecision({ choice: "INSIST_MANDATE", coach: { ...coach, adaptability: 20, relationship: 20, interferenceTolerance: 10 }, aligned: false, seed: 1 }).outcome).toBe("REFUSED"); });

  it("udrží kalibraci přes 100 000 deterministických zápasů", () => { const rand = seeded(4202608); let goals = 0, homeWins = 0, draws = 0; for (let i = 0; i < 100_000; i++) { const home = { id: i * 2, name: "H", short: "H", color: "#111", attack: .9 + rand() * .9, defense: .75 + rand() * .9, homeBoost: 1.12 }; const away = { id: i * 2 + 1, name: "A", short: "A", color: "#222", attack: .9 + rand() * .9, defense: .75 + rand() * .9, homeBoost: 1.12 }; const result = simulateMatch(home, away, { attack: .85 + rand() * .3, concede: .85 + rand() * .3 }, { attack: .85 + rand() * .3, concede: .85 + rand() * .3 }, rand); goals += result.homeGoals + result.awayGoals; homeWins += Number(result.homeGoals > result.awayGoals); draws += Number(result.homeGoals === result.awayGoals); } expect(goals / 100_000).toBeGreaterThan(2); expect(goals / 100_000).toBeLessThan(3.5); expect(homeWins / 100_000).toBeGreaterThan(.35); expect(homeWins / 100_000).toBeLessThan(.55); expect(draws / 100_000).toBeGreaterThan(.18); expect(draws / 100_000).toBeLessThan(.35); });
});
