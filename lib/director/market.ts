import { clamp, hashSeed, seeded } from "./random";

export const FOREIGN_MARKET_CLUBS = [
  { id: -6101, name: "Northbridge FC", country: "Anglie", competition: "English Premier Division", reputation: 84, strength: 79, color: "#7c1d35" },
  { id: -6102, name: "Mersey Athletic", country: "Anglie", competition: "English Premier Division", reputation: 76, strength: 73, color: "#174b7a" },
  { id: -6201, name: "Rhein Adler", country: "Německo", competition: "Bundesliga", reputation: 86, strength: 81, color: "#b51f2b" },
  { id: -6202, name: "Westfalen 09", country: "Německo", competition: "Bundesliga", reputation: 80, strength: 76, color: "#d4ad16" },
  { id: -6301, name: "Milano Rossoneri", country: "Itálie", competition: "Serie A", reputation: 87, strength: 80, color: "#b21f2d" },
  { id: -6302, name: "Torino Bianconeri", country: "Itálie", competition: "Serie A", reputation: 88, strength: 82, color: "#222222" },
  { id: -6401, name: "Madrid Blanco", country: "Španělsko", competition: "La Liga", reputation: 94, strength: 88, color: "#d8d8d8" },
  { id: -6402, name: "Catalunya Blaugrana", country: "Španělsko", competition: "La Liga", reputation: 92, strength: 86, color: "#263b78" },
  { id: -6501, name: "Paris Étoile", country: "Francie", competition: "Ligue 1", reputation: 89, strength: 84, color: "#173f72" },
  { id: -6502, name: "Olympique Provence", country: "Francie", competition: "Ligue 1", reputation: 75, strength: 72, color: "#3198c8" },
  { id: -6601, name: "Lisboa Águias", country: "Portugalsko", competition: "Primeira Liga", reputation: 78, strength: 74, color: "#ba2332" },
  { id: -6602, name: "Amsterdam 1900", country: "Nizozemsko", competition: "Eredivisie", reputation: 79, strength: 74, color: "#c82c35" },
] as const;

export function dynamicMarketValue(input: { ability: number; potential: number; age: number; form: number; contractYears: number; reputation: number; interest: number; cashPressure: number }) {
  const ageCurve = input.age <= 21 ? 1.22 : input.age <= 26 ? 1.1 : input.age <= 29 ? 1 : input.age <= 32 ? .76 : .48;
  const potential = 1 + Math.max(0, input.potential - input.ability) / 55;
  const form = clamp(1 + (input.form - 50) / 250, .82, 1.18);
  const contract = clamp(.72 + input.contractYears * .12, .72, 1.2);
  const prestige = clamp(.72 + input.reputation / 180, .9, 1.25);
  const demand = clamp(1 + input.interest / 300, 1, 1.28);
  const pressure = clamp(1 - input.cashPressure * .14, .82, 1);
  return Math.max(50_000, Math.round(input.ability ** 3 * 52 * ageCurve * potential * form * contract * prestige * demand * pressure / 10_000) * 10_000);
}

export function scoutingSnapshot(input: { seed: number; day: number; playerId: string; ability: number; potential: number; value: number; wage: number; scoutingQuality: number; tacticalFit: number }) {
  const rand = seeded(hashSeed(input.seed, input.day, input.playerId, "scouting-v6"));
  const completeness = clamp(input.scoutingQuality / 100, .15, .95); const spread = 3 + (1 - completeness) * 17;
  const bias = (rand() - .5) * spread * .65;
  return { abilityMin: clamp(input.ability + bias - spread, 20, 99), abilityMax: clamp(input.ability + bias + spread, 20, 99), potentialMin: clamp(input.potential + bias - spread * 1.2, 20, 99), potentialMax: clamp(input.potential + bias + spread * 1.2, 20, 99), valueMin: Math.round(input.value * (1 - .08 - (1 - completeness) * .22)), valueMax: Math.round(input.value * (1 + .1 + (1 - completeness) * .32)), wageMin: Math.round(input.wage * (1 - .06 - (1 - completeness) * .2)), wageMax: Math.round(input.wage * (1 + .08 + (1 - completeness) * .25)), tacticalFit: clamp(input.tacticalFit + (rand() - .5) * spread), personalityConfidence: completeness, completeness };
}

export function contractOfferUtility(input: { wage: number; expectedWage: number; years: number; desiredYears: number; signingBonus: number; agentFee: number; promisedShare: number; desiredShare: number; clubReputation: number; currentReputation: number; competition: number; alternatives: number; agentAmbition: number; credibility: number }) {
  const wage = input.wage / Math.max(1, input.expectedWage); const duration = Math.min(1.12, input.years / Math.max(1, input.desiredYears)); const role = clamp(input.promisedShare / Math.max(.15, input.desiredShare), .3, 1.2); const ambition = clamp((input.clubReputation + input.competition) / Math.max(40, input.currentReputation * 2), .55, 1.25); const cash = (input.signingBonus + input.agentFee * .5) / Math.max(1, input.expectedWage * 52); const competitionCost = input.alternatives * (.05 + input.agentAmbition / 2000); const utility = wage * .43 + duration * .12 + role * .2 + ambition * .14 + cash * .11 - competitionCost;
  const accepted = utility >= 1; const reason = wage < .9 ? "Agent požaduje vyšší garantovanou mzdu." : role < .85 ? "Slíbené vytížení neodpovídá očekávání hráče." : ambition < .82 ? "Hráč pochybuje o sportovní ambici a úrovni soutěže." : input.credibility < 42 ? "Předchozí nesplněné sliby snižují důvěru v nabízenou roli." : accepted ? "Osobní podmínky odpovídají roli, ambici i dostupným alternativám." : "Agent má v tuto chvíli výhodnější alternativu.";
  return { utility, accepted, reason };
}

export function cashFlowProjection(input: { cash: number; reservedCash: number; weeklyWages: number; wageBudget: number; upfront: number; signingBonus: number; agentFee: number; futurePayments: number[]; incoming: number[] }) {
  const immediate = input.cash - input.reservedCash - input.upfront - input.signingBonus - input.agentFee;
  let worst = immediate; let balance = immediate;
  for (let i = 0; i < Math.max(input.futurePayments.length, input.incoming.length, 12); i++) { balance += (input.incoming[i] ?? 0) - (input.futurePayments[i] ?? 0) - Math.max(0, input.weeklyWages - input.wageBudget); worst = Math.min(worst, balance); }
  return { immediate, worst, sustainable: immediate >= 0 && worst >= -Math.max(100_000, input.cash * .08) };
}

