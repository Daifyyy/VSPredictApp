import { describe, expect, it } from "vitest";
import { buildStory } from "./content";
import { generateCoach, generatePlayers } from "./generator";
import { simulateDirectorMatch } from "./matchEngine";
import type { GameTeam } from "@/lib/game/types";

const team: GameTeam = { id: 77, name: "Test FC", short: "TFC", color: "#173f2a", attack: 1.62, defense: 1.04, homeBoost: 1.12 };

describe("director world", () => {
  it("generuje deterministický a pozičně úplný kádr", () => {
    const date = new Date("2026-08-22T12:00:00Z");
    const a = generatePlayers(team, 67, date);
    const b = generatePlayers(team, 67, date);
    expect(a).toEqual(b);
    expect(a).toHaveLength(20);
    expect(a.filter((player) => player.position === "GK")).toHaveLength(2);
    expect(a.some((player) => player.position === "ST")).toBe(true);
    expect(a.every((player) => player.potential >= player.ability)).toBe(true);
  });

  it("respektuje paměť nedávných příběhů", () => {
    const base = { seed: 42, day: 12, clubName: "Test FC", coachName: "Jan Trenér", playerName: "Adam Hráč", cash: 2_000_000, boardTrust: 60, fanTrust: 60, ethicsMode: "REALISTIC" };
    const first = buildStory({ ...base, recentTemplates: [] });
    const second = buildStory({ ...base, recentTemplates: [first.templateId] });
    expect(second.templateId).not.toBe(first.templateId);
    expect(second.choices.length).toBeGreaterThan(1);
  });

  it("simuluje stejný zápas při stejném seedu stejně", () => {
    const start = new Date("2026-08-22T12:00:00Z");
    const makeClub = (id: string, source: GameTeam, managed: boolean) => ({
      id, careerId: "career", externalTeamId: source.id, name: source.name, shortName: source.short,
      logo: null, primaryColor: source.color, isManaged: managed, tier: 1, baseAttack: source.attack,
      baseDefense: source.defense, currentForm: 0, cohesion: 62, morale: 64, cashBalance: 1_000_000,
      transferBudget: 200_000, wageBudget: 300_000, weeklyWages: 200_000, fanTrust: 60,
      boardExpectation: "STABILITY", stadiumName: "Stadion", stadiumCapacity: 12000,
      stadiumAttendance: .72, stadiumCondition: 65, stadiumAtmosphere: 60, stadiumCommercial: 45,
      academyLevel: 2, trainingLevel: 2, medicalLevel: 2, scoutingLevel: 2,
      infrastructure: {}, financeHistory: [], createdAt: start, updatedAt: start,
      players: generatePlayers(source, 67, start).map((player, index) => ({ ...player, id: `${id}-p${index}`, clubId: id, scoutMin: null, scoutMax: null, appearances: 0, minutes: 0, createdAt: start, updatedAt: start })),
      coaches: [{ ...generateCoach(source, 67, start), id: `${id}-coach`, clubId: id, promises: [], createdAt: start, updatedAt: start }],
    });
    const awayTeam = { ...team, id: 88, name: "Away FC", short: "AFC", attack: 1.4, defense: 1.2 };
    const input = { seed: 1234, day: 8, round: 1, home: makeClub("home", team, true), away: makeClub("away", awayTeam, false) };
    expect(simulateDirectorMatch(input)).toEqual(simulateDirectorMatch(input));
  });
});
