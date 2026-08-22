import { clamp, hashSeed, seeded } from "./random";

export const PHASES = ["BUILDUP", "PRESSING", "TRANSITION", "BLOCK", "SET_PIECES", "DISCIPLINE"] as const;
export type Phase = (typeof PHASES)[number];
export type SportingStyle = "BALANCED" | "POSSESSION" | "HIGH_PRESS" | "TRANSITION" | "DEEP_BLOCK";

export interface SportingPolicy {
  desiredStyle: SportingStyle;
  youthPreference: number;
  rotationLevel: number;
  trainingIntensity: number;
  healthRiskTolerance: number;
  phasePriorities: Record<Phase, number>;
}

export interface SportingPlayer {
  id: string; position: string; archetype: string; age: number; ability: number; potential: number;
  ballSkill: number; creation: number; finishing: number; defending: number; physical: number; mentality: number;
  form: number; fitness: number; morale: number; cohesion: number; injuryDays: number;
  acuteLoad?: number; chronicLoad?: number; matchReadiness?: number; healthRisk?: number; healthStatus?: string; minutesLimit?: number | null; recurrenceRisk?: number;
  tacticalFamiliarity?: unknown;
}

export interface SportingCoach {
  id: string; name?: string; status?: string; formation: string; philosophy: string; adaptability: number; youthDevelopment: number;
  matchManagement: number; interferenceTolerance: number; relationship: number; preferredRoles: unknown;
}

export interface PlannedPlayer { playerId: string; role: string; roleFit: number; score: number; reason: string }
export interface SportingPlan {
  formation: string; mentality: string; lineup: PlannedPlayer[]; bench: PlannedPlayer[];
  phases: Record<Phase, number>; reasons: string[]; weaknesses: string[]; confidence: number;
}

const DEFAULT_PHASES: Record<Phase, number> = { BUILDUP: 50, PRESSING: 50, TRANSITION: 50, BLOCK: 50, SET_PIECES: 50, DISCIPLINE: 50 };

export function defaultSportingPolicy(philosophy = "BALANCED"): SportingPolicy {
  const style: SportingStyle = /press/i.test(philosophy) ? "HIGH_PRESS" : /possession|control/i.test(philosophy) ? "POSSESSION" : /counter|transition/i.test(philosophy) ? "TRANSITION" : /defen|block/i.test(philosophy) ? "DEEP_BLOCK" : "BALANCED";
  return { desiredStyle: style, youthPreference: .5, rotationLevel: .5, trainingIntensity: .5, healthRiskTolerance: .35, phasePriorities: { ...DEFAULT_PHASES } };
}

export function normalizePolicy(input: Partial<SportingPolicy>, fallback = defaultSportingPolicy()): SportingPolicy {
  const styles: SportingStyle[] = ["BALANCED", "POSSESSION", "HIGH_PRESS", "TRANSITION", "DEEP_BLOCK"];
  const phases = { ...fallback.phasePriorities };
  for (const phase of PHASES) phases[phase] = clamp(Number(input.phasePriorities?.[phase] ?? phases[phase]), 0, 100);
  return {
    desiredStyle: styles.includes(input.desiredStyle as SportingStyle) ? input.desiredStyle! : fallback.desiredStyle,
    youthPreference: clamp(Number(input.youthPreference ?? fallback.youthPreference), 0, 1),
    rotationLevel: clamp(Number(input.rotationLevel ?? fallback.rotationLevel), 0, 1),
    trainingIntensity: clamp(Number(input.trainingIntensity ?? fallback.trainingIntensity), 0, 1),
    healthRiskTolerance: clamp(Number(input.healthRiskTolerance ?? fallback.healthRiskTolerance), 0, 1),
    phasePriorities: phases,
  };
}

const ROLE_GROUPS: Record<string, string[]> = {
  GK: ["SHOT_STOPPER", "SWEEPER_KEEPER"], CB: ["BLOCK_CB", "BUILD_UP_CB"], FB: ["DEFENSIVE_FB", "ATTACKING_FB"],
  MID: ["BALL_WINNER", "DEEP_PLAYMAKER", "BOX_TO_BOX", "CREATOR"], W: ["DIRECT_WINGER", "INSIDE_FORWARD"],
  ST: ["PRESSING_FORWARD", "TARGET_FORWARD", "RUNNER"],
};

function positionGroup(position: string) {
  if (position === "GK") return "GK"; if (["CB"].includes(position)) return "CB"; if (["LB", "RB", "FB"].includes(position)) return "FB";
  if (["DM", "CM", "AM"].includes(position)) return "MID"; if (["LW", "RW", "W"].includes(position)) return "W"; return "ST";
}

export function roleScores(player: SportingPlayer): Record<string, number> {
  const scores: Record<string, number> = {
    SHOT_STOPPER: player.mentality * .35 + player.physical * .25 + player.ability * .4,
    SWEEPER_KEEPER: player.ballSkill * .3 + player.mentality * .3 + player.ability * .4,
    BLOCK_CB: player.defending * .5 + player.physical * .3 + player.mentality * .2,
    BUILD_UP_CB: player.defending * .35 + player.ballSkill * .35 + player.creation * .15 + player.mentality * .15,
    DEFENSIVE_FB: player.defending * .48 + player.physical * .3 + player.mentality * .22,
    ATTACKING_FB: player.creation * .35 + player.physical * .3 + player.ballSkill * .25 + player.defending * .1,
    BALL_WINNER: player.defending * .42 + player.physical * .32 + player.mentality * .26,
    DEEP_PLAYMAKER: player.creation * .38 + player.ballSkill * .34 + player.mentality * .2 + player.defending * .08,
    BOX_TO_BOX: player.physical * .32 + player.creation * .22 + player.defending * .2 + player.finishing * .14 + player.mentality * .12,
    CREATOR: player.creation * .45 + player.ballSkill * .32 + player.mentality * .13 + player.finishing * .1,
    DIRECT_WINGER: player.physical * .3 + player.creation * .27 + player.finishing * .23 + player.ballSkill * .2,
    INSIDE_FORWARD: player.finishing * .38 + player.ballSkill * .28 + player.creation * .2 + player.physical * .14,
    PRESSING_FORWARD: player.physical * .34 + player.mentality * .26 + player.finishing * .25 + player.creation * .15,
    TARGET_FORWARD: player.physical * .42 + player.finishing * .35 + player.mentality * .23,
    RUNNER: player.finishing * .4 + player.physical * .35 + player.mentality * .15 + player.creation * .1,
  };
  const familiarity = typeof player.tacticalFamiliarity === "object" && player.tacticalFamiliarity ? player.tacticalFamiliarity as Record<string, number> : {};
  for (const key of Object.keys(scores)) scores[key] = clamp(scores[key] * .88 + Number(familiarity[key] ?? 50) * .12, 0, 100);
  return scores;
}

function preferredRole(player: SportingPlayer, coach: SportingCoach) {
  const allowed = ROLE_GROUPS[positionGroup(player.position)] ?? ROLE_GROUPS.ST;
  const scores = roleScores(player); const preferences = Array.isArray(coach.preferredRoles) ? coach.preferredRoles as string[] : [];
  return allowed.map((role) => ({ role, fit: scores[role] + (preferences.includes(role) ? 4 : 0) })).sort((a, b) => b.fit - a.fit)[0];
}

function formationQuotas(formation: string) {
  const parts = formation.split("-").map(Number).filter(Number.isFinite);
  return { GK: 1, DEF: parts[0] ?? 4, MID: parts.length > 3 ? parts.slice(1, -1).reduce((a, b) => a + b, 0) : parts[1] ?? 3, ATT: parts.at(-1) ?? 3 };
}

export function prepareSportingPlan(input: { players: SportingPlayer[]; coach: SportingCoach; policy: SportingPolicy; opponentStrength: number; seed: number; day: number }): SportingPlan {
  const { coach, policy } = input; const quotas = formationQuotas(coach.formation);
  const candidates = input.players.filter((p) => p.injuryDays <= 0 && p.healthStatus !== "ILLNESS" && p.healthStatus !== "ACUTE_INJURY" && (p.matchReadiness ?? p.fitness) >= 35).map((player) => {
    const role = preferredRole(player, coach); const readiness = player.matchReadiness ?? player.fitness;
    const youth = player.age <= 22 ? policy.youthPreference * coach.youthDevelopment * .035 : 0;
    const fatiguePenalty = Math.max(0, (player.acuteLoad ?? 20) - (player.chronicLoad ?? 25) * 1.35) * (1 + policy.rotationLevel) * .3;
    const returnPenalty = player.minutesLimit !== null && player.minutesLimit !== undefined && player.minutesLimit < 60 ? 18 : (player.recurrenceRisk ?? 0) * policy.healthRiskTolerance * .08;
    const score = player.ability * .52 + role.fit * .18 + player.form * .08 + readiness * .1 + player.morale * .05 + player.cohesion * .07 + youth - fatiguePenalty - returnPenalty;
    return { player, role: role.role, roleFit: role.fit, score };
  }).sort((a, b) => b.score - a.score || a.player.id.localeCompare(b.player.id));
  const selected: typeof candidates = [];
  const buckets = { GK: ["GK"], DEF: ["CB", "LB", "RB", "FB"], MID: ["DM", "CM", "AM"], ATT: ["LW", "RW", "W", "ST"] };
  for (const key of Object.keys(buckets) as Array<keyof typeof buckets>) selected.push(...candidates.filter((x) => buckets[key].includes(x.player.position) && !selected.includes(x)).slice(0, quotas[key]));
  selected.push(...candidates.filter((x) => !selected.includes(x)).slice(0, 11 - selected.length));
  const lineup = selected.slice(0, 11).map((x) => ({ playerId: x.player.id, role: x.role, roleFit: x.roleFit, score: x.score, reason: `${x.roleFit >= 70 ? "dobrá" : "přijatelná"} vhodnost role · připravenost ${Math.round(x.player.matchReadiness ?? x.player.fitness)} %` }));
  const bench = candidates.filter((x) => !selected.includes(x)).slice(0, 9).map((x) => ({ playerId: x.player.id, role: x.role, roleFit: x.roleFit, score: x.score, reason: "varianta pro změnu průběhu nebo zatížení" }));
  const avg = (key: keyof SportingPlayer) => selected.reduce((s, x) => s + Number(x.player[key] ?? 0), 0) / Math.max(1, selected.length);
  const philosophy = coach.philosophy.toLowerCase(); const style = policy.desiredStyle;
  const phases: Record<Phase, number> = {
    BUILDUP: avg("ballSkill") * .46 + avg("creation") * .25 + avg("mentality") * .12 + policy.phasePriorities.BUILDUP * .12 + coach.adaptability * .05,
    PRESSING: avg("physical") * .42 + avg("mentality") * .26 + policy.phasePriorities.PRESSING * .17 + coach.matchManagement * .15,
    TRANSITION: avg("physical") * .28 + avg("creation") * .28 + avg("finishing") * .24 + policy.phasePriorities.TRANSITION * .15 + coach.adaptability * .05,
    BLOCK: avg("defending") * .52 + avg("mentality") * .2 + avg("physical") * .12 + policy.phasePriorities.BLOCK * .11 + coach.matchManagement * .05,
    SET_PIECES: avg("physical") * .3 + avg("creation") * .25 + avg("finishing") * .2 + policy.phasePriorities.SET_PIECES * .15 + coach.matchManagement * .1,
    DISCIPLINE: avg("mentality") * .5 + (100 - policy.trainingIntensity * 35) * .2 + policy.phasePriorities.DISCIPLINE * .15 + coach.matchManagement * .15,
  };
  if (style === "POSSESSION" || philosophy.includes("possession")) phases.BUILDUP += 5;
  if (style === "HIGH_PRESS" || philosophy.includes("press")) phases.PRESSING += 5;
  if (style === "TRANSITION") phases.TRANSITION += 5;
  if (style === "DEEP_BLOCK") phases.BLOCK += 5;
  for (const phase of PHASES) phases[phase] = clamp(phases[phase], 25, 90);
  const strength = avg("ability"); const mentality = input.opponentStrength > strength + 6 ? "CAUTIOUS" : strength > input.opponentStrength + 7 ? "PROACTIVE" : "BALANCED";
  const weakest = PHASES.slice().sort((a, b) => phases[a] - phases[b]).slice(0, 2);
  return { formation: coach.formation, mentality, lineup, bench, phases, reasons: [`Plán vychází z filozofie ${coach.philosophy} a dostupnosti ${lineup.length} hráčů.`, `Priorita vedení je ${style.toLowerCase()}; trenér ji promítl podle své adaptability.`], weaknesses: weakest.map((p) => `${p}: nižší vhodnost sestavy`), confidence: clamp(lineup.length / 11 * .6 + coach.adaptability / 250 + selected.reduce((s, x) => s + x.roleFit, 0) / Math.max(1, selected.length) / 500, 0, 1) };
}

export function phaseMatchup(home: SportingPlan, away: SportingPlan) {
  const duel = (attack: number, defense: number) => clamp(1 + (attack - defense) / 220, .85, 1.15);
  const homeAttack = clamp((duel(home.phases.BUILDUP, away.phases.PRESSING) * .35 + duel(home.phases.TRANSITION, away.phases.BLOCK) * .4 + duel(home.phases.SET_PIECES, away.phases.BLOCK) * .25), .85, 1.15);
  const awayAttack = clamp((duel(away.phases.BUILDUP, home.phases.PRESSING) * .35 + duel(away.phases.TRANSITION, home.phases.BLOCK) * .4 + duel(away.phases.SET_PIECES, home.phases.BLOCK) * .25), .85, 1.15);
  const tempo = clamp(70 + (home.phases.PRESSING + away.phases.PRESSING - 100) * .18 + (home.phases.TRANSITION + away.phases.TRANSITION - 100) * .12, 55, 92);
  const possessionHome = clamp(50 + (home.phases.BUILDUP - away.phases.BUILDUP) * .22 + (home.phases.PRESSING - away.phases.PRESSING) * .08, 32, 68);
  return { homeAttack, awayAttack, tempo, possessionHome, possessionAway: 100 - possessionHome };
}

export function trainingUpdate(player: SportingPlayer, policy: SportingPolicy, day: number, seed: number) {
  const rand = seeded(hashSeed(seed, day, player.id, "training-v4")); const intensity = policy.trainingIntensity;
  const acute = clamp((player.acuteLoad ?? 20) * .72 + (18 + intensity * 28) * .28, 5, 100);
  const chronic = clamp((player.chronicLoad ?? 25) * .94 + acute * .06, 5, 100); const ratio = acute / Math.max(10, chronic);
  const biologicalRisk = clamp(4 + Math.max(0, ratio - 1) * 28 + Math.max(0, 72 - player.fitness) * .38 + intensity * 5, 2, 65);
  const readiness = clamp(player.fitness * .62 + player.morale * .16 + player.form * .12 + (100 - acute) * .1, 20, 100);
  return { acuteLoad: acute, chronicLoad: chronic, matchReadiness: readiness, healthRisk: biologicalRisk, fitness: clamp(player.fitness + 3.2 - intensity * 2.6 - (rand() < .02 ? 1 : 0), 20, 100) };
}

export function meetingDecision(input: { choice: "SUPPORT" | "REQUEST_PRIORITY" | "INSIST_MANDATE"; coach: SportingCoach; aligned: boolean; seed: number }) {
  if (input.choice === "SUPPORT") return { outcome: "ACCEPTED", phaseDelta: 0, relationshipDelta: 1.5, explanation: "Ředitel podpořil trenérův plán a posílil vzájemnou důvěru." };
  const score = input.coach.adaptability * .35 + input.coach.relationship * .35 + input.coach.interferenceTolerance * .3 + (input.aligned ? 12 : -12);
  if (input.choice === "INSIST_MANDATE") return score >= 45 ? { outcome: "ACCEPTED", phaseDelta: 5, relationshipDelta: input.aligned ? 0 : -4, explanation: "Trenér požadavek zapracuje v mezích sjednaného mandátu." } : { outcome: "REFUSED", phaseDelta: 0, relationshipDelta: -6, explanation: "Trenér odmítl zásah jako překročení sportovního mandátu." };
  return score >= 62 ? { outcome: "ACCEPTED", phaseDelta: 4, relationshipDelta: .5, explanation: "Trenér změnu priority přijal." } : score >= 42 ? { outcome: "MODIFIED", phaseDelta: 2, relationshipDelta: 0, explanation: "Trenér podnět upravil podle svého plánu a možností kádru." } : { outcome: "REFUSED", phaseDelta: 0, relationshipDelta: -1, explanation: "Trenér podnět věcně odmítl kvůli nevhodnosti pro sestavu." };
}
