import type { GameTeam } from "@/lib/game/types";
import { between, clamp, hashSeed, pick, seeded } from "./random";

const FIRST_NAMES = ["Adam", "David", "Jakub", "Matěj", "Tomáš", "Martin", "Filip", "Jan", "Lukáš", "Patrik", "Daniel", "Samuel", "Ondřej", "Marek", "Viktor", "Alex"] as const;
const LAST_NAMES = ["Novák", "Černý", "Horák", "Procházka", "Král", "Veselý", "Beneš", "Kučera", "Marek", "Dvořák", "Kovář", "Jelínek", "Urban", "Fiala", "Polák", "Kadlec"] as const;
const PERSONALITIES = ["profesionál", "ambiciózní", "týmový", "temperamentní", "klidný", "soutěživý"] as const;
const POSITIONS = ["GK", "GK", "CB", "CB", "CB", "LB", "RB", "DM", "CM", "CM", "AM", "LW", "RW", "ST", "ST", "CB", "CM", "FB", "W", "ST"] as const;
const ARCHETYPES: Record<string, readonly string[]> = {
  GK: ["brankář na čáře", "rozehrávající brankář"],
  CB: ["stoper do bloku", "rozehrávající stoper", "důrazný obránce"],
  LB: ["ofenzivní bek", "zajišťující bek"], RB: ["ofenzivní bek", "zajišťující bek"], FB: ["univerzální bek"],
  DM: ["defenzivní štít", "hluboký tvůrce"], CM: ["box-to-box", "tvůrce hry"], AM: ["kreativní desítka"],
  LW: ["rychlé křídlo", "křídlo do zakončení"], RW: ["rychlé křídlo", "křídlo do zakončení"], W: ["univerzální křídlo"],
  ST: ["presující útočník", "cílový útočník", "útočník do náběhu"],
};

export function clubEconomy(team: GameTeam, rank: number, size: number) {
  const strength = clamp(56 + (team.attack - team.defense) * 13 + (size - rank) * 0.8, 42, 82);
  const cash = Math.round((2_500_000 + strength * strength * 2_200) / 10_000) * 10_000;
  return {
    strength,
    cashBalance: cash,
    transferBudget: Math.round(cash * 0.24),
    wageBudget: Math.round(85_000 + strength * 5_200),
    stadiumCapacity: Math.round((4_500 + strength * strength * 3.1) / 500) * 500,
  };
}

export function generatePlayers(team: GameTeam, strength: number, startDate: Date) {
  const rand = seeded(hashSeed(team.id, team.name, "squad-v1"));
  return POSITIONS.map((position, index) => {
    const age = Math.round(between(rand, index < 3 ? 24 : 18, index < 3 ? 34 : 33));
    const peakAdjustment = age < 22 ? -between(rand, 2, 8) : age > 30 ? -between(rand, 1, 6) : between(rand, -2, 3);
    const ability = clamp(strength + peakAdjustment + between(rand, -8, 8), 35, 90);
    const potential = clamp(Math.max(ability, ability + (age < 24 ? between(rand, 3, 15) : between(rand, 0, 4))), ability, 94);
    const roleScale = (key: "attack" | "defense") => key === "attack" ? team.attack : 2.5 - team.defense;
    const contract = new Date(startDate);
    contract.setUTCFullYear(contract.getUTCFullYear() + 1 + Math.floor(rand() * 4));
    const wage = Math.round((600 + ability * ability * 1.45) / 50) * 50;
    const value = Math.round((ability * ability * Math.max(0.35, (36 - age) / 15) * 1_900) / 10_000) * 10_000;
    return {
      firstName: pick(FIRST_NAMES, rand), lastName: pick(LAST_NAMES, rand), position,
      preferredFoot: rand() < 0.22 ? "L" : "R", archetype: pick(ARCHETYPES[position] ?? ["univerzál"], rand),
      personality: pick(PERSONALITIES, rand), age, ability, potential,
      ballSkill: clamp(ability + between(rand, -10, 10)), creation: clamp(ability + roleScale("attack") * 2 + between(rand, -12, 8)),
      finishing: clamp(ability + (["ST", "LW", "RW", "AM"].includes(position) ? 7 : -10) + between(rand, -8, 8)),
      defending: clamp(ability + (["CB", "LB", "RB", "FB", "DM"].includes(position) ? 8 : -9) + roleScale("defense") * 2 + between(rand, -8, 8)),
      physical: clamp(ability + between(rand, -10, 10)), mentality: clamp(ability + between(rand, -9, 10)),
      form: between(rand, 45, 58), fitness: between(rand, 86, 98), morale: between(rand, 52, 72), cohesion: between(rand, 48, 68),
      injuryDays: 0, contractUntil: contract, weeklyWage: wage, marketValue: Math.max(50_000, value),
      promisedRole: index < 11 ? "STARTER" : index < 16 ? "ROTATION" : "SQUAD",
    };
  });
}

const COACH_FIRST = ["Pavel", "Michal", "Roman", "Petr", "Ivan", "Miroslav", "Karel", "Jiří"] as const;
const COACH_LAST = ["Svoboda", "Krejčí", "Konečný", "Bartoš", "Pospíšil", "Tichý", "Šimek", "Hruška"] as const;
const PHILOSOPHIES = ["aktivní pressing", "kontrola míče", "rychlé přechody", "pevný blok", "práce s mladými"] as const;

export function generateCoach(team: GameTeam, strength: number, startDate: Date) {
  const rand = seeded(hashSeed(team.id, "coach-v1"));
  const contractUntil = new Date(startDate);
  contractUntil.setUTCFullYear(contractUntil.getUTCFullYear() + 2 + Math.floor(rand() * 3));
  return {
    name: `${pick(COACH_FIRST, rand)} ${pick(COACH_LAST, rand)}`,
    philosophy: pick(PHILOSOPHIES, rand), formation: pick(["4-3-3", "4-2-3-1", "3-4-2-1", "4-4-2"] as const, rand),
    adaptability: between(rand, 48, 82), youthDevelopment: between(rand, 45, 85), manManagement: between(rand, 48, 84), matchManagement: between(rand, 48, 84),
    relationship: 65, transferAuthority: rand() < 0.25 ? "VETO" : "CONSULT", transferVeto: rand() < 0.25,
    contractUntil, weeklyWage: Math.round((2_000 + strength * 170) / 100) * 100, severanceMonths: 6,
  };
}
