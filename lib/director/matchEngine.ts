import type { DirectorCoach, DirectorClub, DirectorPlayer } from "@prisma/client";
import { matchLambdas, simulateMatch } from "@/lib/game/simulate";
import type { GameTeam } from "@/lib/game/types";
import { clamp, hashSeed, seeded } from "./random";

type ClubWithSquad = DirectorClub & { players: DirectorPlayer[]; coaches: DirectorCoach[] };

function squadStrength(club: ClubWithSquad) {
  const eleven = selectedLineup(club);
  const coach = club.coaches[0];
  const weighted = eleven.reduce((sum, player) => sum + player.ability * 0.72 + player.form * 0.1 + player.fitness * 0.1 + player.mentality * 0.08, 0) / Math.max(1, eleven.length);
  const coachFit = coach ? (coach.matchManagement + coach.adaptability) / 2 : 50;
  return clamp(weighted * 0.82 + coachFit * 0.08 + club.cohesion * 0.06 + club.morale * 0.04, 30, 92);
}

function selectedLineup(club: ClubWithSquad) {
  const scored = club.players.filter((player) => player.injuryDays <= 0).sort((a, b) => {
    const scoreA = a.ability * .72 + a.form * .1 + a.fitness * .1 + a.mentality * .08;
    const scoreB = b.ability * .72 + b.form * .1 + b.fitness * .1 + b.mentality * .08;
    return scoreB - scoreA;
  });
  const formation = (club.coaches[0]?.formation ?? "4-3-3").split("-").map(Number).filter(Number.isFinite);
  const quotas = { GK: 1, DEF: formation[0] ?? 4, MID: formation.length > 3 ? formation.slice(1, -1).reduce((sum, item) => sum + item, 0) : formation[1] ?? 3, ATT: formation.at(-1) ?? 3 };
  const groups = { GK: ["GK"], DEF: ["CB", "LB", "RB", "FB"], MID: ["DM", "CM", "AM"], ATT: ["LW", "RW", "W", "ST"] };
  const picked: typeof scored = [];
  for (const key of Object.keys(groups) as Array<keyof typeof groups>) picked.push(...scored.filter((player) => groups[key].includes(player.position) && !picked.includes(player)).slice(0, quotas[key]));
  picked.push(...scored.filter((player) => !picked.includes(player)).slice(0, 11 - picked.length));
  return picked.slice(0, 11);
}

function asGameTeam(club: ClubWithSquad, strength: number): GameTeam {
  const scale = strength / 62;
  const lineup = selectedLineup(club);
  const attackingFit = lineup.reduce((sum, player) => sum + player.creation * .45 + player.finishing * .4 + player.ballSkill * .15, 0) / Math.max(1, lineup.length) / 60;
  const defensiveFit = lineup.reduce((sum, player) => sum + player.defending * .58 + player.physical * .27 + player.mentality * .15, 0) / Math.max(1, lineup.length) / 60;
  return { id: club.externalTeamId, name: club.name, short: club.shortName, color: club.primaryColor, logo: club.logo ?? undefined, attack: clamp(club.baseAttack * scale * clamp(attackingFit, .78, 1.24), 0.35, 3.1), defense: clamp(club.baseDefense / Math.max(.65, scale * clamp(defensiveFit, .78, 1.24)), 0.35, 3.1), homeBoost: 1.12 };
}

export function simulateDirectorMatch(input: { seed: number; day: number; round: number; home: ClubWithSquad; away: ClubWithSquad }) {
  const rand = seeded(hashSeed(input.seed, input.day, input.round, "director-match-v1"));
  const homeLineup = selectedLineup(input.home); const awayLineup = selectedLineup(input.away);
  const homeStrength = squadStrength(input.home); const awayStrength = squadStrength(input.away);
  const homeTeam = asGameTeam(input.home, homeStrength); const awayTeam = asGameTeam(input.away, awayStrength);
  const [homeXg, awayXg] = matchLambdas(homeTeam, awayTeam);
  const result = simulateMatch(homeTeam, awayTeam, { attack: 1, concede: 1 }, { attack: 1, concede: 1 }, rand);
  const events: Array<{ minute: number; type: string; text: string }> = [];
  for (let i = 0; i < result.homeGoals; i++) events.push({ minute: 5 + Math.floor(rand() * 84), type: "GOAL", text: `Gól · ${input.home.name}` });
  for (let i = 0; i < result.awayGoals; i++) events.push({ minute: 5 + Math.floor(rand() * 84), type: "GOAL", text: `Gól · ${input.away.name}` });
  const chances = Math.max(3, Math.round(homeXg + awayXg + rand() * 3));
  for (let i = 0; i < chances; i++) { const team = rand() < homeXg / Math.max(.1, homeXg + awayXg) ? input.home : input.away; events.push({ minute: 3 + Math.floor(rand() * 86), type: "CHANCE", text: `Velká šance · ${team.name}` }); }
  if (rand() < .52) events.push({ minute: 20 + Math.floor(rand() * 65), type: "TACTIC", text: `${input.home.coaches[0]?.name ?? "Trenér domácích"} upravuje strukturu hry.` });
  if (rand() < .52) events.push({ minute: 20 + Math.floor(rand() * 65), type: "TACTIC", text: `${input.away.coaches[0]?.name ?? "Trenér hostů"} reaguje změnou tempa.` });
  const cards = 2 + Math.floor(rand() * 5);
  for (let i = 0; i < cards; i++) { const team = rand() < .5 ? input.home : input.away; events.push({ minute: 10 + Math.floor(rand() * 80), type: "CARD", text: `Žlutá karta · ${team.name}` }); }
  events.sort((a, b) => a.minute - b.minute);
  const managedHome = input.home.isManaged;
  const gf = managedHome ? result.homeGoals : result.awayGoals; const ga = managedHome ? result.awayGoals : result.homeGoals;
  const xgf = managedHome ? homeXg : awayXg; const xga = managedHome ? awayXg : homeXg;
  const headline = gf > ga ? "Trenérův plán přinesl výsledek" : gf < ga ? "Výsledek odkryl slabá místa kádru" : "Vyrovnaný zápas bez rozhodující převahy";
  const summary = xgf > xga + .35 ? `Tým vytvořil kvalitnější šance (${xgf.toFixed(2)}–${xga.toFixed(2)} xG), výsledek ale ovlivnila i koncovka.` : xga > xgf + .35 ? `Soupeř měl výraznější šance (${xga.toFixed(2)} xG). Vedení by mělo s trenérem probrat strukturu bez míče.` : `Rozdíl xG byl malý (${xgf.toFixed(2)}–${xga.toFixed(2)}). Jednotlivý výsledek není důvodem měnit dlouhodobý plán.`;
  return { homeGoals: result.homeGoals, awayGoals: result.awayGoals, homeXg, awayXg, homeStrength, awayStrength, homeLineupIds: homeLineup.map((item) => item.id), awayLineupIds: awayLineup.map((item) => item.id), timeline: events, coachReport: { headline, summary } };
}
