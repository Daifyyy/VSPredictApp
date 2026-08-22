import { clamp, hashSeed, seeded } from "./random";

export const IDENTITY_PILLARS = ["ACADEMY", "LOCAL", "DATA", "SUSTAINABLE", "ATTRACTIVE", "WIN_NOW", "COMMERCIAL"] as const;
export type IdentityPillar = typeof IDENTITY_PILLARS[number];

export const PROJECTS = {
  PITCH: { title: "Modernizace trávníku", costMin: 180_000, costMax: 280_000, days: 14, operatingCost: 12_000, capacityDelta: 0, benefit: { zone: "PITCH", quality: 12 } },
  ACTIVE_END: { title: "Aktivní tribuna a kotel", costMin: 420_000, costMax: 680_000, days: 24, operatingCost: 18_000, capacityDelta: 800, benefit: { zone: "ACTIVE_END", quality: 14, atmosphere: 9 } },
  HOSPITALITY: { title: "Hospitality a komerční patro", costMin: 850_000, costMax: 1_350_000, days: 38, operatingCost: 42_000, capacityDelta: 250, benefit: { zone: "HOSPITALITY", quality: 16, commercial: 12 } },
  EXPANSION: { title: "Rozšíření stadionu", costMin: 2_400_000, costMax: 4_100_000, days: 75, operatingCost: 95_000, capacityDelta: 4_000, benefit: { zone: "STANDS", quality: 9 } },
  NEW_STADIUM: { title: "Nový klubový stadion", costMin: 12_000_000, costMax: 21_000_000, days: 210, operatingCost: 320_000, capacityDelta: 10_000, benefit: { zone: "ALL", quality: 24, atmosphere: 12, commercial: 18 } },
  ACADEMY: { title: "Rozvoj akademického areálu", costMin: 700_000, costMax: 1_150_000, days: 45, operatingCost: 38_000, capacityDelta: 0, benefit: { zone: "ACADEMY", quality: 1 } },
} as const;
export type CapitalProjectKind = keyof typeof PROJECTS;

export function projectStudy(kind: CapitalProjectKind, seed: number, day: number, preparation = .65) {
  const source = PROJECTS[kind]; const rand = seeded(hashSeed(seed, day, kind, "capital-v7"));
  const estimate = Math.round(source.costMin + (source.costMax - source.costMin) * (.35 + rand() * .35));
  const contingency = Math.round(estimate * (.08 + (1 - preparation) * .14));
  const confidence = clamp(.45 + preparation * .42 - (kind === "NEW_STADIUM" ? .08 : 0), .35, .92);
  return { ...source, estimate, contingency, confidence, targetDay: day + source.days, temporaryCapacityRatio: kind === "NEW_STADIUM" ? .65 : kind === "EXPANSION" ? .72 : kind === "ACTIVE_END" ? .88 : 1 };
}

export function projectShock(input: { seed: number; projectId: string; day: number; confidence: number; spent: number; approvedCost: number }) {
  const rand = seeded(hashSeed(input.seed, input.projectId, input.day, "project-risk-v7")); const chance = clamp(.2 - input.confidence * .14, .035, .15);
  if (rand() >= chance) return null;
  const overrun = Math.round(input.approvedCost * (.025 + rand() * .065));
  return { overrun, delay: 2 + Math.floor(rand() * 7), reason: rand() < .5 ? "Dodavatel odhalil technickou komplikaci." : "Dodávka materiálu se zpozdila." };
}

export function attendanceDemand(input: { capacity: number; standardPrice: number; opponentAppeal: number; form: number; comfort: number; safety: number; access: number; segments: Array<{ kind: string; size: number; trust: number; priceSensitivity: number; sportingSensitivity: number }> }) {
  const referencePrice = 22; const bySegment: Record<string, number> = {};
  for (const segment of input.segments) {
    const price = clamp(1 - Math.max(0, input.standardPrice - referencePrice) / referencePrice * segment.priceSensitivity, .3, 1.15);
    const sport = clamp(.72 + (input.opponentAppeal - 50) / 180 + input.form / 100 * segment.sportingSensitivity, .45, 1.2);
    const venue = clamp(.58 + input.comfort / 300 + input.safety / 500 + input.access / 600, .55, 1.08);
    bySegment[segment.kind] = Math.max(0, Math.round(segment.size * price * sport * venue * clamp(segment.trust / 65, .45, 1.18)));
  }
  const attendance = Math.min(input.capacity, Object.values(bySegment).reduce((sum, value) => sum + value, 0));
  return { attendance, bySegment, fill: attendance / Math.max(1, input.capacity), ticketRevenue: Math.round(attendance * input.standardPrice) };
}

export function academyDevelopment(input: { ability: number; potential: number; age: number; minutes: number; coaching: number; facilities: number; focusFit: number; seed: number; playerId: string; day: number }) {
  const rand = seeded(hashSeed(input.seed, input.playerId, input.day, "academy-development-v7"));
  const ceiling = Math.max(0, input.potential - input.ability); const ageFactor = input.age <= 17 ? 1 : input.age === 18 ? .82 : .62;
  const environment = clamp((input.coaching + input.facilities * 12 + input.focusFit) / 230, .25, 1.05);
  const minutes = clamp(input.minutes / 900, .15, 1); const delta = Math.min(.22, ceiling * .0028 * ageFactor * environment * minutes * (.8 + rand() * .4));
  return { abilityDelta: delta, readinessDelta: clamp(delta * 8 + input.minutes / 1500, 0, 2.5) };
}

export function identityProfile(input: { declared: string[]; youthShare: number; localShare: number; dataTransfers: number; balanceTrend: number; attackingStyle: number; leaguePosition: number; commercialRevenue: number; previousChanges: number }) {
  const observed: Record<IdentityPillar, number> = {
    ACADEMY: clamp(input.youthShare * 140), LOCAL: clamp(input.localShare * 105), DATA: clamp(35 + input.dataTransfers * 12), SUSTAINABLE: clamp(55 + input.balanceTrend / 100_000), ATTRACTIVE: clamp(40 + input.attackingStyle * 35), WIN_NOW: clamp(105 - input.leaguePosition * 7), COMMERCIAL: clamp(35 + input.commercialRevenue / 60_000),
  };
  const selected = input.declared.filter((item): item is IdentityPillar => IDENTITY_PILLARS.includes(item as IdentityPillar));
  const alignment = selected.length ? selected.reduce((sum, key) => sum + observed[key], 0) / selected.length : 50;
  return { observed, alignment, credibility: clamp(alignment - input.previousChanges * 8), drivers: selected.map((key) => `${key}: ${Math.round(observed[key])}/100`) };
}

export function sponsorOfferValue(input: { reputation: number; attendance: number; onlineReach: number; stability: number; sponsorBudget: number; ethics: number }) {
  const appeal = clamp(input.reputation * .34 + input.attendance / 500 + input.onlineReach / 2000 + input.stability * .2, 20, 105);
  const guaranteed = Math.round(Math.min(input.sponsorBudget, input.sponsorBudget * (.35 + appeal / 150)) / 10_000) * 10_000;
  return { guaranteed, bonus: Math.round(guaranteed * .2), reputationalRisk: clamp((45 - input.ethics) / 45, 0, 1) };
}
