import { clamp, hashSeed, seeded } from "./random";
import { PHASES, type Phase, type SportingPolicy } from "./sporting";

export interface CoachMemoryState { phaseAssessment: Record<Phase, number>; tacticalBudget: number; systemFamiliarity: number; predictability: number; lastFormation: string | null; lastStyle: string | null; recentPlans: Array<{ day: number; formation: string; style: string; phases: Record<Phase, number>; performance: number }>; confidence: number }
export interface MatchEvidence { day: number; phases: Partial<Record<Phase, number>>; xgFor: number; xgAgainst: number; points: number; opponentStrength: number; ownStrength: number; formation: string; style: string }

const neutral = () => Object.fromEntries(PHASES.map((phase) => [phase, 50])) as Record<Phase, number>;
export function defaultCoachMemory(): CoachMemoryState { return { phaseAssessment: neutral(), tacticalBudget: 300, systemFamiliarity: 50, predictability: 0, lastFormation: null, lastStyle: null, recentPlans: [], confidence: 0 }; }

export function normalizePhaseBudget(values: Record<Phase, number>, budget = 300) {
  const bounded = Object.fromEntries(PHASES.map((phase) => [phase, clamp(values[phase] ?? 50, 25, 75)])) as Record<Phase, number>;
  for (let pass = 0; pass < 4; pass++) { const total = PHASES.reduce((sum, phase) => sum + bounded[phase], 0); const delta = budget - total; const movable = PHASES.filter((phase) => delta > 0 ? bounded[phase] < 75 : bounded[phase] > 25); if (!movable.length || Math.abs(delta) < .001) break; for (const phase of movable) bounded[phase] = clamp(bounded[phase] + delta / movable.length, 25, 75); }
  return bounded;
}

export function updateCoachMemory(input: { previous?: CoachMemoryState; evidence: MatchEvidence[]; adaptability: number; analyticsQuality: number; seed: number }) {
  const previous = input.previous ?? defaultCoachMemory(); const sample = input.evidence.slice(-10); const rand = seeded(hashSeed(input.seed, sample.at(-1)?.day ?? 0, "coach-memory-v5")); const assessments = { ...previous.phaseAssessment }; let weightSum = 0;
  sample.forEach((match, index) => { const recency = (index + 1) / sample.length; const opponent = clamp(match.opponentStrength / Math.max(30, match.ownStrength), .7, 1.35); const quality = clamp((match.xgFor - match.xgAgainst) * 12 + (match.points - 1.25) * 2, -18, 18) * opponent; const weight = .35 + recency * .65; weightSum += weight; for (const phase of PHASES) assessments[phase] += ((match.phases[phase] ?? 50) - 50) * .18 * weight + quality * .22 * weight; });
  const historicalSample = Math.min(10, previous.recentPlans.length + sample.length); const confidence = clamp(historicalSample / 8 * (input.analyticsQuality / 100), .08, 1); const noise = (1 - confidence) * 4; for (const phase of PHASES) assessments[phase] = clamp((weightSum ? assessments[phase] / (1 + weightSum * .04) : previous.phaseAssessment[phase]) + (rand() - .5) * noise, 25, 75);
  const weakest = PHASES.slice().sort((a, b) => assessments[a] - assessments[b])[0]; const strongest = PHASES.slice().sort((a, b) => assessments[b] - assessments[a])[0]; const step = clamp(input.adaptability / 30 * confidence, .3, 3);
  const priorities = { ...previous.phaseAssessment }; priorities[weakest] += step; priorities[strongest] -= step;
  return { memory: { ...previous, phaseAssessment: normalizePhaseBudget(priorities, previous.tacticalBudget), confidence, recentPlans: [...previous.recentPlans, ...sample.map((m) => ({ day: m.day, formation: m.formation, style: m.style, phases: { ...neutral(), ...m.phases }, performance: m.xgFor - m.xgAgainst }))].slice(-10) }, adaptation: { strengthened: weakest, reduced: strongest, step, netChange: 0, confidence } };
}

export function systemCosts(input: { previous: CoachMemoryState; formation: string; style: string; phases: Record<Phase, number> }) {
  const formationChanged = Boolean(input.previous.lastFormation && input.previous.lastFormation !== input.formation); const styleChanged = Boolean(input.previous.lastStyle && input.previous.lastStyle !== input.style); const repeated = input.previous.recentPlans.slice(-5).filter((plan) => plan.formation === input.formation && plan.style === input.style).length;
  const phaseChange = PHASES.reduce((sum, phase) => sum + Math.abs(input.phases[phase] - input.previous.phaseAssessment[phase]), 0) / PHASES.length; const magnitude = clamp(phaseChange / 20 + Number(formationChanged) * .55 + Number(styleChanged) * .35, 0, 1);
  return { changeMagnitude: magnitude, cohesionCost: clamp(magnitude * 12, 0, 12), familiarity: clamp(input.previous.systemFamiliarity + (magnitude < .12 ? 2 : -magnitude * 10), 25, 85), predictability: clamp(input.previous.predictability * .82 + repeated * 4 - magnitude * 16, 0, 35) };
}

export function chooseMicrocycle(input: { daysToMatch: number | null; daysSinceMatch: number | null; matchesNextSevenDays: number; policy: SportingPolicy; coachRiskBias: number }) {
  const congestion = clamp((input.matchesNextSevenDays - 1) / 3, 0, 1); let kind = "CONDITIONING", focus: Phase | "RECOVERY" | "ROLES" = "ROLES";
  if ((input.daysSinceMatch ?? 9) <= 1) { kind = "RECOVERY"; focus = "RECOVERY"; }
  else if ((input.daysToMatch ?? 9) <= 1) { kind = "MATCH_PREP"; focus = PHASES.slice().sort((a, b) => input.policy.phasePriorities[b] - input.policy.phasePriorities[a])[0]; }
  else if ((input.daysToMatch ?? 9) <= 3) { kind = "TACTICAL"; focus = "ROLES"; }
  const intensity = clamp(input.policy.trainingIntensity * (1 - congestion * .45) + input.coachRiskBias * .08 - (kind === "RECOVERY" ? .35 : 0), .15, .9);
  return { kind, focus, intensity, congestion, load: 12 + intensity * 30, explanation: congestion > .5 ? "Nabitý program snižuje intenzitu a zvyšuje význam regenerace a rotace." : kind === "MATCH_PREP" ? "Den před utkáním patří přípravě na soupeře, nikoliv budování kondice." : kind === "RECOVERY" ? "Po zápase má přednost biologická regenerace." : "Trenér rozvíjí role a dlouhodobou sportovní politiku." };
}

export function medicalState(input: { injuryDays: number; fitness: number; acuteLoad: number; chronicLoad: number; previousStatus?: string; currentDay: number; medicalInformationQuality: number; seed?: number }) {
  const ratio = input.acuteLoad / Math.max(10, input.chronicLoad); const overload = input.injuryDays <= 0 && ratio > 1.45; const returning = input.injuryDays <= 0 && ["ACUTE_INJURY", "OVERLOAD", "ILLNESS", "RETURNING"].includes(input.previousStatus ?? "FIT"); const illness = !returning && input.injuryDays <= 0 && input.seed !== undefined && seeded(hashSeed(input.seed, input.currentDay, "illness-v5"))() < .003; const status = input.injuryDays > 0 ? "ACUTE_INJURY" : illness ? "ILLNESS" : overload ? "OVERLOAD" : returning ? "RETURNING" : "FIT"; const recurrenceRisk = clamp((returning ? 18 : 0) + Math.max(0, ratio - 1) * 22 + Math.max(0, 75 - input.fitness) * .35, 0, 60); const uncertainty = clamp(1 - input.medicalInformationQuality / 100, .05, .65); const min = input.injuryDays ? input.currentDay + Math.max(1, Math.floor(input.injuryDays * (1 - uncertainty * .35))) : illness ? input.currentDay + 1 : null; const max = input.injuryDays ? input.currentDay + Math.ceil(input.injuryDays * (1 + uncertainty * .55)) : illness ? input.currentDay + 3 : null; const minutesLimit = status === "RETURNING" ? clamp(Math.round(25 + input.fitness * .45 - recurrenceRisk * .25), 20, 70) : overload ? 60 : null;
  return { status, issueType: status === "ACUTE_INJURY" ? "ACUTE" : status === "OVERLOAD" ? "LOAD" : status === "ILLNESS" ? "ILLNESS" : null, recurrenceRisk, estimatedMinDay: min, estimatedMaxDay: max, minutesLimit, uncertainty, readiness: status === "ILLNESS" ? clamp(input.fitness - 35, 20, 60) : clamp(input.fitness - recurrenceRisk * .35, 20, 100) };
}

export function evolveRoleFamiliarity(input: { familiarity: Record<string, number>; usedRole?: string; minutes: number; tacticalTraining: boolean }) { const next: Record<string, number> = {}; for (const [role, value] of Object.entries(input.familiarity)) next[role] = clamp(value - (role === input.usedRole ? 0 : .035), 25, 90); if (input.usedRole) next[input.usedRole] = clamp((next[input.usedRole] ?? 50) + input.minutes / 90 * .8 + Number(input.tacticalTraining) * .2, 25, 90); return next; }
