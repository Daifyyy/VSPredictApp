import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getGameLeague } from "@/lib/data/repository";
import { GAME_LEAGUES, MOCK_LEAGUE, SECOND_TIERS } from "@/lib/game/leagues";
import type { CurrentUser } from "@/lib/authUser";
import type { GameTeam } from "@/lib/game/types";
import { ACHIEVEMENTS, buildStory, openingStories, pulseForStory } from "./content";
import { clubEconomy, generateCoach, generatePlayers } from "./generator";
import { clamp, hashSeed, seeded } from "./random";
import { DIRECTOR_WORLD_VERSION, MAX_BANKED_STEPS, type DirectorChoice, type DirectorDTO } from "./types";
import { simulateDirectorMatch } from "./matchEngine";
import { commitmentState, describeDrivers, diminishingMagnitude, effectAppliedTotal, effectValue, weightedForm } from "./causal";
import { roundRobinSchedule, tableRows } from "./season";
import { boardReview, coachEvaluation, informationQuality, playerExpectation, STAFF_ROLES, targetMinuteShare, transferOfferUtility, transferWindow } from "./people";
import { defaultSportingPolicy, meetingDecision, normalizePolicy, PHASES, roleScores, trainingUpdate, type SportingStyle } from "./sporting";
import { chooseMicrocycle, defaultCoachMemory, evolveRoleFamiliarity, medicalState, systemCosts, updateCoachMemory, type CoachMemoryState, type MatchEvidence } from "./adaptation";
import { cashFlowProjection, contractOfferUtility, dynamicMarketValue, FOREIGN_MARKET_CLUBS, scoutingSnapshot } from "./market";

const CAREER_INCLUDE = {
  clubs: { include: { players: true, coaches: true }, orderBy: { name: "asc" as const } },
  events: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" as const }, take: 12 },
  pulsePosts: { orderBy: [{ dayIndex: "desc" as const }, { createdAt: "desc" as const }], take: 24 },
  achievements: { orderBy: { unlockedAt: "desc" as const } },
  matches: { orderBy: { scheduledDay: "asc" as const } },
  negotiations: { orderBy: { updatedAt: "desc" as const } },
  projects: { orderBy: { createdAt: "desc" as const } },
  effects: { orderBy: { createdAt: "desc" as const }, take: 80 },
  commitments: { orderBy: [{ status: "asc" as const }, { dueDay: "asc" as const }], take: 40 },
  relationships: { orderBy: { actorType: "asc" as const } },
  ledger: { orderBy: [{ dayIndex: "desc" as const }, { createdAt: "desc" as const }], take: 80 },
  seasons: { include: { standings: true }, orderBy: { number: "desc" as const }, take: 1 },
  needs: { where: { status: "OPEN" }, orderBy: { urgency: "desc" as const }, take: 30 },
  causalLogs: { orderBy: [{ dayIndex: "desc" as const }, { importance: "desc" as const }], take: 60 },
  agents: true,
  expectations: true,
  squadGroups: true,
  staff: true,
  transferCases: { include: { offers: { orderBy: { round: "asc" as const } }, registration: true }, orderBy: { updatedAt: "desc" as const }, take: 40 },
  registrations: true,
  coachCandidates: { orderBy: { reputation: "desc" as const }, take: 12 },
  coachNegotiations: { orderBy: { updatedAt: "desc" as const }, take: 12 },
  objectives: true,
  boardReviews: { orderBy: { dayIndex: "desc" as const }, take: 12 },
  jobOffers: { orderBy: { createdAt: "desc" as const }, take: 12 },
  sportPolicies: true,
  sportMeetings: { orderBy: { createdAt: "desc" as const }, take: 24 },
  matchPlans: { orderBy: { createdAt: "desc" as const }, take: 40 },
  playerAppearances: { orderBy: { createdAt: "desc" as const }, take: 300 },
  coachMemories: true,
  trainingCycles: { orderBy: { dayIndex: "desc" as const }, take: 80 },
  opponentAnalyses: { orderBy: { createdAt: "desc" as const }, take: 40 },
  medicalReports: { orderBy: { dayIndex: "desc" as const }, take: 120 },
  planReviews: { orderBy: { createdDay: "desc" as const }, take: 80 },
  scoutingReports: { orderBy: { createdAt: "desc" as const }, take: 120 },
  shortlistEntries: { orderBy: [{ priority: "asc" as const }, { updatedAt: "desc" as const }], take: 80 },
  contractTalks: { include: { offers: { orderBy: { round: "asc" as const } }, transferCase: true }, orderBy: { updatedAt: "desc" as const }, take: 40 },
  competingBids: { orderBy: { createdAt: "desc" as const }, take: 80 },
  transferPayments: { orderBy: { dueDay: "asc" as const }, take: 160 },
  transferClauses: true,
} satisfies Prisma.DirectorCareerInclude;

type LoadedCareer = Prisma.DirectorCareerGetPayload<{ include: typeof CAREER_INCLUDE }>;

function ownerKey(user: CurrentUser): string {
  return user.email ?? `user:${user.id}`;
}

function leagueMeta(leagueId: number) {
  return [...GAME_LEAGUES, ...SECOND_TIERS, MOCK_LEAGUE].find((league) => league.id === leagueId) ?? null;
}

function effectiveSteps(career: Pick<LoadedCareer, "availableSteps" | "lastStepGrantAt">, now = new Date()) {
  const elapsed = Math.max(0, now.getTime() - career.lastStepGrantAt.getTime());
  const earned = Math.floor(elapsed / 86_400_000);
  return Math.min(MAX_BANKED_STEPS, career.availableSteps + earned);
}

function nextGrantAnchor(career: Pick<LoadedCareer, "lastStepGrantAt">, now = new Date()) {
  const elapsedDays = Math.floor(Math.max(0, now.getTime() - career.lastStepGrantAt.getTime()) / 86_400_000);
  if (elapsedDays === 0) return career.lastStepGrantAt;
  return new Date(career.lastStepGrantAt.getTime() + elapsedDays * 86_400_000);
}

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asChoices(value: Prisma.JsonValue): DirectorChoice[] {
  return Array.isArray(value) ? (value as unknown as DirectorChoice[]) : [];
}

function coachMemoryState(memory: LoadedCareer["coachMemories"][number] | undefined): CoachMemoryState {
  if (!memory) return defaultCoachMemory();
  const fallback = defaultCoachMemory();
  return {
    phaseAssessment: { ...fallback.phaseAssessment, ...(memory.phaseAssessment as Partial<CoachMemoryState["phaseAssessment"]>) },
    tacticalBudget: memory.tacticalBudget,
    systemFamiliarity: memory.systemFamiliarity,
    predictability: memory.predictability,
    lastFormation: memory.lastFormation,
    lastStyle: memory.lastStyle,
    recentPlans: Array.isArray(memory.recentPlans) ? memory.recentPlans as unknown as CoachMemoryState["recentPlans"] : [],
    confidence: memory.confidence,
  };
}

async function upgradeCausalWorld(tx: Prisma.TransactionClient, career: LoadedCareer) {
  if (career.version >= 2 && career.seasons.length) return;
  const schedule = roundRobinSchedule(career.clubs.map((item) => item.id));
  await tx.directorMatch.deleteMany({ where: { careerId: career.id, status: "SCHEDULED" } });
  await tx.directorMatch.createMany({ data: schedule.map((match) => ({ careerId: career.id, ...match })), skipDuplicates: true });
  let season = career.seasons[0];
  if (!season) season = await tx.directorSeason.create({ data: { careerId: career.id, number: 1, endDay: Math.max(...schedule.map((item) => item.scheduledDay)) + 7, rules: { pointsWin: 3, pointsDraw: 1 } }, include: { standings: true } });
  await tx.directorMatch.updateMany({ where: { careerId: career.id, seasonId: null }, data: { seasonId: season.id } });
  await tx.directorStanding.createMany({ data: career.clubs.map((club) => ({ seasonId: season.id, clubId: club.id })), skipDuplicates: true });
  const managed = career.clubs.find((item) => item.isManaged)!;
  await tx.directorRelationship.createMany({ data: [
    { careerId: career.id, actorType: "BOARD", actorName: "Klubová rada", trust: career.boardTrust, respect: 58, alignment: 55, priorities: { finance: .7, results: .65 } },
    { careerId: career.id, actorType: "COACH", actorId: managed.coaches[0]?.id, actorName: managed.coaches[0]?.name ?? "Hlavní trenér", trust: managed.coaches[0]?.relationship ?? 65, respect: 62, alignment: 58, priorities: { squad: .8, authority: .6 } },
    { careerId: career.id, actorType: "SUPPORTERS", actorName: "Rada fanoušků", trust: managed.fanTrust, respect: 55, alignment: 52, priorities: { identity: .8, prices: .7 } },
    { careerId: career.id, actorType: "MEDIA", actorName: "Kluboví novináři", trust: career.mediaCredibility, respect: 52, alignment: 45, priorities: { transparency: .8 } },
  ], skipDuplicates: true });
  await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: career.dayIndex, sourceType: "MIGRATION", category: "WORLD", headline: "Svět přešel na kauzální model", explanation: "Dosavadní výsledky zůstaly zachované. Nové vlivy, závazky a finance se sledují od tohoto dne.", importance: 3 } });
  await tx.directorCareer.update({ where: { id: career.id }, data: { version: 2 } });
}

const PERSON_NAMES = ["Martin Vacek", "Petr Holub", "Tomáš Urban", "Jan Mareš", "Lukáš Černý", "David Král", "Ondřej Bartoš", "Michal Kříž", "Roman Jelínek", "Viktor Blažek", "Marek Doležal", "Adam Procházka"];
const PERSONALITIES = ["PRAGMATIC", "AMBITIOUS", "LOYAL", "HARD_NEGOTIATOR", "ANALYTICAL"];

function seasonRules(endDay: number) {
  const middle = Math.max(28, Math.floor(endDay / 2));
  return { pointsWin: 3, pointsDraw: 1, transferWindows: [{ name: "Hlavní přestupní okno", start: 0, end: 24 }, { name: "Zimní přestupní okno", start: middle - 7, end: middle + 7 }] };
}

async function upgradePeopleWorld(tx: Prisma.TransactionClient, career: LoadedCareer) {
  if (career.version >= 3) return;
  const season = career.seasons[0];
  const rand = seeded(hashSeed(career.worldSeed, "people-v3"));
  if (season) {
    await tx.directorSeason.update({ where: { id: season.id }, data: { rules: seasonRules(season.endDay) } });
    await tx.directorMatch.updateMany({ where: { careerId: career.id, seasonId: null }, data: { seasonId: season.id } });
  }

  const agents = await Promise.all(Array.from({ length: Math.max(8, Math.ceil(career.clubs.length * 1.5)) }, async (_, index) => tx.directorAgent.create({ data: {
    careerId: career.id, name: PERSON_NAMES[index % PERSON_NAMES.length], personality: PERSONALITIES[index % PERSONALITIES.length],
    ambition: 40 + rand() * 50, negotiation: 42 + rand() * 50, loyalty: 35 + rand() * 55,
    priorities: { wage: .35 + rand() * .35, role: .25 + rand() * .3, ambition: .2 + rand() * .3 },
  } })));

  for (const club of career.clubs) {
    const coach = club.coaches[0];
    if (coach) await tx.directorCoach.update({ where: { id: coach.id }, data: {
      personality: PERSONALITIES[Math.floor(rand() * PERSONALITIES.length)], reputation: clamp((coach.matchManagement + coach.manManagement) / 2), ambition: 45 + rand() * 45,
      interferenceTolerance: 35 + rand() * 50, preferredRoles: ["CB", "CM", "ST"], mandate: { budget: club.transferBudget, philosophy: coach.philosophy, youthTarget: .12, transferAuthority: coach.transferAuthority, veto: coach.transferVeto, minimumPatienceDays: 24 },
    } });
    for (const player of club.players) {
      const agent = agents[Math.floor(rand() * agents.length)];
      await tx.directorPlayer.update({ where: { id: player.id }, data: { agentId: agent.id } });
      await tx.directorPlayerExpectation.create({ data: { careerId: career.id, playerId: player.id, expectedRole: player.promisedRole, targetMinuteShare: targetMinuteShare(player.promisedRole), wageSatisfaction: 48 + rand() * 38, ambition: 40 + rand() * 50, willingness: 62 + rand() * 30 } });
    }
    const leaders = club.players.slice().sort((a, b) => b.mentality - a.mentality).slice(0, 4).map((item) => item.id);
    const young = club.players.filter((item) => item.age <= 22).slice(0, 7).map((item) => item.id);
    await tx.directorSquadGroup.createMany({ data: [
      { careerId: career.id, clubId: club.id, kind: "LEADERS", name: "Lídři kabiny", memberIds: leaders, influence: 72 },
      { careerId: career.id, clubId: club.id, kind: "YOUTH", name: "Mladé jádro", memberIds: young, influence: 42 },
    ], skipDuplicates: true });
    for (const [index, role] of STAFF_ROLES.entries()) await tx.directorStaff.create({ data: {
      careerId: career.id, clubId: club.id, role, name: PERSON_NAMES[(index + club.name.length) % PERSON_NAMES.length], ability: clamp(42 + club.tier * 3 + rand() * 32), personality: PERSONALITIES[(index + 2) % PERSONALITIES.length], weeklyWage: Math.round(900 + rand() * 2600), workload: 28 + rand() * 35, relationship: 52 + rand() * 28, contractUntil: new Date(Date.UTC(career.gameDate.getUTCFullYear() + 2, 5, 30)),
    } });
  }

  for (let index = 0; index < 6; index++) await tx.directorCoachCandidate.create({ data: {
    careerId: career.id, name: PERSON_NAMES[(index + 4) % PERSON_NAMES.length], personality: PERSONALITIES[index % PERSONALITIES.length], reputation: 45 + rand() * 42, ambition: 48 + rand() * 45, philosophy: ["CONTROL", "PRESS", "TRANSITION", "BALANCED"][index % 4], formation: ["4-3-3", "4-2-3-1", "3-4-2-1"][index % 3], youthDevelopment: 42 + rand() * 48, manManagement: 45 + rand() * 45, matchManagement: 45 + rand() * 45, wageDemand: Math.round(7000 + rand() * 18000),
  } });
  for (const [index, role] of STAFF_ROLES.entries()) await tx.directorStaff.create({ data: { careerId: career.id, clubId: null, role, name: PERSON_NAMES[(index + 8) % PERSON_NAMES.length], ability: 55 + rand() * 35, personality: PERSONALITIES[(index + 1) % PERSONALITIES.length], weeklyWage: Math.round(1200 + rand() * 3200), workload: 0, relationship: 50, contractUntil: new Date(Date.UTC(career.gameDate.getUTCFullYear() + 2, 5, 30)), status: "CANDIDATE" } });
  const managed = career.clubs.find((item) => item.isManaged)!;
  if (season) await tx.directorSeasonObjective.createMany({ data: [
    { careerId: career.id, seasonId: season.id, clubId: managed.id, kind: "SPORTING", target: Math.max(1, Math.ceil(career.clubs.length * .55)), weight: .5, explanation: "Umístění odpovídající síle a rozpočtu klubu." },
    { careerId: career.id, seasonId: season.id, clubId: managed.id, kind: "FINANCE", target: 0, weight: .25, explanation: "Udržet kladnou hotovost po odečtení splatných závazků." },
    { careerId: career.id, seasonId: season.id, clubId: managed.id, kind: "ACADEMY", target: 900, weight: .15, explanation: "Dát mladým hráčům měřitelný prostor v soutěžních utkáních." },
    { careerId: career.id, seasonId: season.id, clubId: managed.id, kind: "INFRASTRUCTURE", target: 1, weight: .1, explanation: "Dokončit alespoň jeden smysluplný klubový projekt." },
  ], skipDuplicates: true });
  await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: career.dayIndex, sourceType: "MIGRATION", category: "WORLD", headline: "Klubový svět získal vlastní aktéry a trh", explanation: "Trenéři, hráči, agenti a zaměstnanci mají od tohoto dne vlastní očekávání, alternativy a paměť. Dosavadní výsledky a finance zůstaly beze změny.", importance: 3 } });
  await tx.directorCareer.update({ where: { id: career.id }, data: { version: 3 } });
}

async function upgradeSportingWorld(tx: Prisma.TransactionClient, career: LoadedCareer) {
  if (career.version >= 4) return;
  await tx.directorSportPolicy.createMany({ data: career.clubs.map((club) => {
    const coach = club.coaches.find((item) => item.status === "ACTIVE") ?? club.coaches[0];
    const policy = defaultSportingPolicy(coach?.philosophy);
    return { careerId: career.id, clubId: club.id, desiredStyle: policy.desiredStyle, youthPreference: policy.youthPreference, rotationLevel: policy.rotationLevel, trainingIntensity: policy.trainingIntensity, healthRiskTolerance: policy.healthRiskTolerance, phasePriorities: policy.phasePriorities, updatedDay: career.dayIndex };
  }), skipDuplicates: true });
  for (const player of career.clubs.flatMap((club) => club.players)) {
    await tx.directorPlayer.update({ where: { id: player.id }, data: { tacticalFamiliarity: roleScores(player), acuteLoad: 20, chronicLoad: 25, matchReadiness: Math.min(100, player.fitness * .92 + player.morale * .08), healthRisk: Math.max(2, (100 - player.fitness) * .22) } });
  }
  await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: career.dayIndex, sourceType: "MIGRATION", category: "SPORT", headline: "Sportovní provoz přešel na model v4", explanation: "Budoucí zápasy nově používají trenérské plány, role, šest fází hry, střídání a skutečné vytížení. Již odehrané výsledky zůstaly beze změny.", importance: 4 } });
  await tx.directorCareer.update({ where: { id: career.id }, data: { version: 4 } });
}

async function upgradeAdaptiveWorld(tx: Prisma.TransactionClient, career: LoadedCareer) {
  if (career.version >= 5) return;
  await tx.directorCoachMemory.createMany({ data: career.clubs.flatMap((club) => { const coach = club.coaches.find((item) => item.status === "ACTIVE") ?? club.coaches[0]; if (!coach) return []; const memory = defaultCoachMemory(); return [{ careerId: career.id, clubId: club.id, coachId: coach.id, phaseAssessment: memory.phaseAssessment, tacticalBudget: memory.tacticalBudget, systemFamiliarity: memory.systemFamiliarity, predictability: memory.predictability, lastFormation: coach.formation, lastStyle: coach.philosophy, recentPlans: [], confidence: 0, updatedDay: career.dayIndex }]; }), skipDuplicates: true });
  await tx.directorPlayer.updateMany({ where: { club: { careerId: career.id } }, data: { healthStatus: "FIT", recurrenceRisk: 0 } });
  await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: career.dayIndex, sourceType: "MIGRATION", category: "SPORT", headline: "Trenéři získali paměť a adaptivní mikrocyklus", explanation: "Budoucí plány přerozdělují omezený taktický rozpočet. Zlepšení jedné fáze proto nevytváří čistý bonus a soupeři používají stejná pravidla.", importance: 4 } });
  await tx.directorCareer.update({ where: { id: career.id }, data: { version: 5 } });
}

async function upgradeTransferWorld(tx: Prisma.TransactionClient, career: LoadedCareer) {
  if (career.version >= 6) return;
  await tx.directorClub.updateMany({ where: { careerId: career.id }, data: { simulationMode: "DETAIL", competitionName: career.leagueName, country: career.country } });
  for (const club of career.clubs) await tx.directorPlayer.updateMany({ where: { clubId: club.id }, data: { owningClubId: club.id, languageGroup: "LOCAL" } });
  const existingIds = new Set(career.clubs.map((club) => club.externalTeamId));
  for (const template of FOREIGN_MARKET_CLUBS.filter((item) => !existingIds.has(item.id))) {
    const team: GameTeam = { id: template.id, name: template.name, short: template.name.split(" ").map((part) => part[0]).join("").slice(0, 4), color: template.color, attack: clamp(template.strength / 42, .8, 2.2), defense: clamp(2.3 - template.strength / 62, .55, 1.45), homeBoost: 1.1 };
    const economy = clubEconomy(team, 1, 18); const roster = generatePlayers(team, template.strength, career.gameDate).map((player) => ({ ...player, languageGroup: template.country, adaptation: 45, owningClubId: null as string | null }));
    const club = await tx.directorClub.create({ data: { careerId: career.id, externalTeamId: template.id, name: template.name, shortName: team.short, primaryColor: template.color, simulationMode: "AGGREGATE", competitionName: template.competition, country: template.country, reputation: template.reputation, marketProfile: { attraction: template.reputation, competitionStrength: template.strength, weeklyVolatility: .08 }, tier: 1, baseAttack: team.attack, baseDefense: team.defense, cashBalance: Math.round(economy.cashBalance * (1 + template.reputation / 80)), transferBudget: Math.round(economy.transferBudget * (1 + template.reputation / 70)), wageBudget: Math.round(economy.wageBudget * (1 + template.reputation / 90)), weeklyWages: roster.reduce((sum, player) => sum + player.weeklyWage, 0), stadiumName: `Arena ${template.name}`, stadiumCapacity: Math.round(economy.stadiumCapacity * 1.6), players: { create: roster }, coaches: { create: generateCoach(team, template.strength, career.gameDate) } }, include: { players: true } });
    await tx.directorPlayer.updateMany({ where: { clubId: club.id }, data: { owningClubId: club.id } });
  }
  await tx.directorPlayer.updateMany({ where: { club: { careerId: career.id }, owningClubId: null }, data: { adaptation: 70 } });
  await tx.directorTransferCase.updateMany({ where: { careerId: career.id, status: "OPEN" }, data: { stage: "CLUB", deadlineDay: career.dayIndex + 7, patience: 4 } });
  await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: career.dayIndex, sourceType: "MIGRATION", category: "MARKET", headline: "Klubový svět se otevřel zahraničnímu trhu", explanation: "Domácí soutěž zůstává simulována detailně. Zahraniční kluby používají lehčí tržní režim, ale stejné finance, scouting a vyjednávací principy.", importance: 4 } });
  await tx.directorCareer.update({ where: { id: career.id }, data: { version: 6 } });
}

async function runAiTransferActivity(tx: Prisma.TransactionClient, career: LoadedCareer, day: number) {
  const buyers = career.clubs.filter((item) => !item.isManaged && item.players.length < 27 && item.cashBalance > item.weeklyWages * 10).sort((a, b) => b.transferBudget - a.transferBudget);
  const buyer = buyers.length ? buyers[day % buyers.length] : null;
  if (!buyer) return;
  const need = career.needs.filter((item) => item.clubId === buyer.id && item.status === "OPEN").sort((a, b) => b.urgency - a.urgency)[0];
  if (!need || need.urgency < 55) return;
  const target = career.clubs.filter((item) => item.id !== buyer.id && item.players.length > 18).flatMap((seller) => seller.players.filter((player) => player.position === need.target && !["AGREED", "LOCKED"].includes(player.transferStatus)).map((player) => ({ seller, player }))).filter((item) => item.player.marketValue <= buyer.transferBudget * 1.2).sort((a, b) => b.player.potential / Math.max(1, b.player.marketValue) - a.player.potential / Math.max(1, a.player.marketValue))[0];
  if (!target) return;
  const rand = seeded(hashSeed(career.worldSeed, day, buyer.id, target.player.id, "ai-market"));
  const terms = { upfront: Math.round(target.player.marketValue * (.84 + rand() * .25)), installments: Math.round(target.player.marketValue * (.08 + rand() * .16)), bonuses: Math.round(target.player.marketValue * .07), sellOn: 8, loanFee: 0, weeklyWage: Math.round(target.player.weeklyWage * (1.12 + rand() * .2)), years: target.player.age < 29 ? 4 : 2, promisedRole: "ROTATION" };
  const result = transferOfferUtility({ marketValue: target.player.marketValue, ...terms, offeredWage: terms.weeklyWage, offeredYears: terms.years, importance: target.player.promisedRole === "STARTER" ? 1 : .45, sellerCashPressure: target.seller.cashBalance < target.seller.weeklyWages * 8 ? 1 : .15, replacementDifficulty: target.seller.players.filter((item) => item.position === target.player.position && item.id !== target.player.id).length < 2 ? .9 : .3, rivalry: 0, currentWage: target.player.weeklyWage, targetYears: target.player.age < 28 ? 4 : 2, roleFit: .9, clubAmbitionFit: clamp((buyer.reputation + 25) / Math.max(40, target.seller.reputation + 25), .65, 1.15) });
  const contract = contractOfferUtility({ wage: terms.weeklyWage, expectedWage: target.player.weeklyWage * 1.15, years: terms.years, desiredYears: target.player.age < 28 ? 4 : 2, signingBonus: terms.weeklyWage * 6, agentFee: terms.weeklyWage * 3, promisedShare: .45, desiredShare: targetMinuteShare(target.player.promisedRole), clubReputation: buyer.reputation, currentReputation: target.seller.reputation, competition: buyer.reputation, alternatives: 0, agentAmbition: 55, credibility: 60 });
  const sustainable = cashFlowProjection({ cash: buyer.cashBalance, reservedCash: buyer.reservedCash, weeklyWages: buyer.weeklyWages + terms.weeklyWage, wageBudget: buyer.wageBudget, upfront: terms.upfront, signingBonus: terms.weeklyWage * 6, agentFee: terms.weeklyWage * 3, futurePayments: [terms.installments], incoming: [] }).sustainable;
  const accepted = result.seller >= 1 && contract.accepted && sustainable;
  const item = await tx.directorTransferCase.create({ data: { careerId: career.id, playerId: target.player.id, sellingClubId: target.seller.id, buyingClubId: buyer.id, initiatedBy: "AI", stage: target.seller.isManaged ? "CLUB" : accepted ? "REGISTRATION" : "CLOSED", status: target.seller.isManaged ? "OPEN" : accepted ? "AGREED" : "REJECTED", playerAgreement: contract.accepted ? "AGREED" : "REJECTED", agreedDay: accepted ? day : null, deadlineDay: day + 5, failureReason: accepted ? null : !sustainable ? "Nabídka neprošla kontrolou budoucí hotovosti." : contract.reason } });
  await tx.directorTransferOffer.create({ data: { caseId: item.id, round: 1, submittedByClubId: buyer.id, ...terms, sellerUtility: result.seller, playerUtility: result.player, response: result.reason } });
  if (target.seller.isManaged) { await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: day, sourceType: "TRANSFER_CASE", sourceId: item.id, category: "TRANSFER", headline: `Příchozí nabídka za ${target.player.firstName} ${target.player.lastName}`, explanation: `${buyer.name} nabízí ${terms.upfront.toLocaleString("cs-CZ")} okamžitě. Nabídka čeká na rozhodnutí vedení a případné trenérské veto.`, targetType: "PLAYER", targetId: target.player.id, importance: 3 } }); return; }
  if (!accepted) return;
  const window = transferWindow(day, career.seasons[0]?.rules);
  if (window.registrationDay === null) return;
  await tx.directorTransferCase.update({ where: { id: item.id }, data: { registrationDay: window.registrationDay } });
  await tx.directorRegistration.create({ data: { careerId: career.id, caseId: item.id, playerId: target.player.id, fromClubId: target.seller.id, toClubId: buyer.id, effectiveDay: window.registrationDay } });
  await tx.directorClub.update({ where: { id: buyer.id }, data: { cashBalance: { decrement: terms.upfront }, transferBudget: { decrement: Math.min(buyer.transferBudget, terms.upfront) } } });
  await tx.directorClub.update({ where: { id: target.seller.id }, data: { cashBalance: { increment: terms.upfront } } });
  if (terms.installments > 0) for (let part = 1; part <= 3; part++) await tx.directorTransferPayment.create({ data: { careerId: career.id, caseId: item.id, payerClubId: buyer.id, payeeClubId: target.seller.id, kind: "INSTALLMENT", amount: Math.round(terms.installments / 3), dueDay: day + part * 30 } });
}

async function loadActive(user: CurrentUser): Promise<LoadedCareer | null> {
  return prisma.directorCareer.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: CAREER_INCLUDE,
  });
}

export async function getDirectorWorld(user: CurrentUser): Promise<DirectorDTO | null> {
  let career = await loadActive(user);
  if (!career) return null;
  if (career.version < 2 || !career.seasons.length) {
    await prisma.$transaction((tx) => upgradeCausalWorld(tx, career!), { timeout: 30_000 });
    career = await loadActive(user);
    if (!career) return null;
  }
  if (career.version < 3) {
    await prisma.$transaction((tx) => upgradePeopleWorld(tx, career!), { timeout: 30_000 });
    career = await loadActive(user);
    if (!career) return null;
  }
  if (career.version < 4) {
    await prisma.$transaction((tx) => upgradeSportingWorld(tx, career!), { timeout: 30_000 });
    career = await loadActive(user);
    if (!career) return null;
  }
  if (career.version < DIRECTOR_WORLD_VERSION) {
    await prisma.$transaction((tx) => upgradeAdaptiveWorld(tx, career!), { timeout: 30_000 });
    career = await loadActive(user);
    if (!career) return null;
  }
  if (career.version < DIRECTOR_WORLD_VERSION) {
    await prisma.$transaction((tx) => upgradeTransferWorld(tx, career!), { timeout: 60_000 });
    career = await loadActive(user);
    if (!career) return null;
  }
  const legacy = await prisma.gameSave.findUnique({ where: { email: ownerKey(user) }, select: { email: true } });
  return toDTO(career, Boolean(legacy));
}

export async function createDirectorWorld(input: {
  user: CurrentUser;
  leagueId: number;
  teamId: number;
  directorName: string;
  ethicsMode: "OFF" | "REALISTIC" | "EXTENDED";
}): Promise<DirectorDTO> {
  const meta = leagueMeta(input.leagueId);
  if (!meta) throw new Error("Zvolená soutěž není pro kariéru dostupná.");

  // Jediný datový dotyk kariéry: sestavení startovního snapshotu. Následné hraní pracuje
  // výhradně s Director* tabulkami. Repository používá sdílenou dlouhodobou cache tabulek.
  const snapshot = await getGameLeague(input.leagueId);
  const managed = snapshot.teams.find((team) => team.id === input.teamId);
  if (!managed) throw new Error("Vybraný klub ve startovním snapshotu chybí.");
  const startDate = new Date();
  startDate.setUTCHours(12, 0, 0, 0);
  const seed = hashSeed(input.user.id, input.leagueId, input.teamId, startDate.toISOString().slice(0, 10));

  const createdId = await prisma.$transaction(async (tx) => {
    await tx.directorCareer.updateMany({ where: { userId: input.user.id, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    const career = await tx.directorCareer.create({
      data: {
        userId: input.user.id, ownerEmail: ownerKey(input.user), name: input.directorName,
        version: 2, leagueId: input.leagueId, leagueName: meta.name,
        country: meta.country, worldSeed: seed, gameDate: startDate, ethicsMode: input.ethicsMode,
        identityTags: ["nové vedení"],
      },
    });

    let managedClubId = "";
    for (const [rank, team] of snapshot.teams.entries()) {
      const economy = clubEconomy(team, rank + 1, snapshot.teams.length);
      const roster = generatePlayers(team, economy.strength, startDate);
      const isManaged = team.id === input.teamId;
      const club = await tx.directorClub.create({
        data: {
          careerId: career.id, externalTeamId: team.id, name: team.name, shortName: team.short,
          logo: team.logo, primaryColor: team.color, isManaged, baseAttack: team.attack,
          baseDefense: team.defense, cashBalance: economy.cashBalance,
          transferBudget: economy.transferBudget, wageBudget: economy.wageBudget,
          weeklyWages: roster.reduce((sum, player) => sum + player.weeklyWage, 0),
          stadiumName: `Stadion ${team.name}`, stadiumCapacity: economy.stadiumCapacity,
          academyLevel: Math.max(1, Math.round((economy.strength - 35) / 14)),
          trainingLevel: Math.max(1, Math.round((economy.strength - 32) / 13)),
          medicalLevel: Math.max(1, Math.round((economy.strength - 35) / 15)),
          scoutingLevel: Math.max(1, Math.round((economy.strength - 34) / 14)),
          players: { create: roster },
          coaches: { create: generateCoach(team, economy.strength, startDate) },
        },
      });
      if (isManaged) managedClubId = club.id;
    }
    await tx.directorCareer.update({ where: { id: career.id }, data: { managedClubId } });

    const createdClubs = await tx.directorClub.findMany({ where: { careerId: career.id }, orderBy: { name: "asc" } });
    const managedCreated = createdClubs.find((item) => item.isManaged)!;
    const schedule = roundRobinSchedule(createdClubs.map((item) => item.id));
    await tx.directorMatch.createMany({ data: schedule.map((match) => ({ careerId: career.id, ...match })) });
    const season = await tx.directorSeason.create({ data: { careerId: career.id, number: 1, endDay: Math.max(...schedule.map((item) => item.scheduledDay)) + 7, rules: { pointsWin: 3, pointsDraw: 1, relegationPlaces: Math.min(3, Math.max(1, Math.floor(createdClubs.length / 6))) } } });
    await tx.directorStanding.createMany({ data: createdClubs.map((item) => ({ seasonId: season.id, clubId: item.id })) });
    await tx.directorMatch.updateMany({ where: { careerId: career.id, seasonId: null }, data: { seasonId: season.id } });
    await tx.directorRelationship.createMany({ data: [
      { careerId: career.id, actorType: "BOARD", actorName: "Klubová rada", trust: 65, respect: 58, alignment: 55, priorities: { finance: .7, results: .65 } },
      { careerId: career.id, actorType: "COACH", actorName: "Hlavní trenér", trust: 65, respect: 62, alignment: 58, priorities: { squad: .8, authority: .6 } },
      { careerId: career.id, actorType: "SUPPORTERS", actorName: "Rada fanoušků", trust: 60, respect: 55, alignment: 52, priorities: { identity: .8, prices: .7 } },
      { careerId: career.id, actorType: "MEDIA", actorName: "Kluboví novináři", trust: 55, respect: 52, alignment: 45, priorities: { transparency: .8 } },
    ] });
    await tx.directorLedgerEntry.create({ data: { careerId: career.id, clubId: managedCreated.id, dayIndex: 0, category: "OPENING_BALANCE", direction: "IN", amount: managedCreated.cashBalance, sourceType: "CAREER", sourceId: career.id, description: "Počáteční hotovost převzatého klubu" } });
    await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: 0, sourceType: "CAREER", sourceId: career.id, category: "WORLD", headline: "Vznikl samostatný klubový svět", explanation: "Výchozí síla, finance a kádr pocházejí ze startovního snapshotu. Další vývoj už řídí pouze simulace kariéry.", importance: 3 } });

    const coach = generateCoach(managed, clubEconomy(managed, 1, snapshot.teams.length).strength, startDate);
    const samplePlayer = generatePlayers(managed, 60, startDate)[10];
    const context = { seed, day: 0, clubName: managed.name, coachName: coach.name, playerName: `${samplePlayer.firstName} ${samplePlayer.lastName}`, cash: 1_000_000, boardTrust: 65, fanTrust: 60, recentTemplates: [], ethicsMode: input.ethicsMode };
    const stories = openingStories(context);
    await tx.directorEvent.createMany({ data: stories.map((story) => ({ careerId: career.id, templateId: story.templateId, category: story.category, severity: story.severity, title: story.title, body: story.body, choices: story.choices as unknown as Prisma.InputJsonValue, dueDay: story.dueDay, memoryTags: story.memoryTags, createdDay: 0 })) });
    await tx.directorPulsePost.create({ data: { careerId: career.id, dayIndex: 0, authorType: "CLUB", authorName: managed.name, tone: "OFFICIAL", body: `${managed.name} zahajuje novou kapitolu. Sportovní a klubové vedení přebírá ${input.directorName}.`, topic: "CLUB", trust: 100, reach: 8500 } });
    return career.id;
  }, { timeout: 30_000 });

  void createdId;
  return (await getDirectorWorld(input.user))!;
}

export async function resolveDirectorEvent(user: CurrentUser, eventId: string, choiceKey: string): Promise<DirectorDTO> {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const event = active.events.find((item) => item.id === eventId);
  if (!event || event.status !== "OPEN") throw new Error("Rozhodnutí už není dostupné.");
  const selected = asChoices(event.choices).find((item) => item.key === choiceKey);
  if (!selected) throw new Error("Neplatná volba.");
  const club = active.clubs.find((item) => item.isManaged);
  if (!club) throw new Error("Řízený klub chybí.");
  const coach = club.coaches[0];

  await prisma.$transaction(async (tx) => {
    await tx.directorEvent.update({ where: { id: event.id }, data: { status: "RESOLVED", selectedKey: choiceKey, resolvedDay: active.dayIndex, resolvedAt: new Date() } });
    const definitions = [
      { metric: "BOARD_TRUST", value: selected.effects.boardTrust, targetType: "CAREER", targetId: active.id, label: "důvěru klubové rady" },
      { metric: "PUBLIC_TRUST", value: selected.effects.publicTrust, targetType: "CAREER", targetId: active.id, label: "veřejnou důvěru" },
      { metric: "MEDIA_CREDIBILITY", value: selected.effects.mediaCredibility, targetType: "CAREER", targetId: active.id, label: "důvěryhodnost v médiích" },
      { metric: "FAN_TRUST", value: selected.effects.fanTrust, targetType: "CLUB", targetId: club.id, label: "vztah s fanoušky" },
      { metric: "COACH_TRUST", value: selected.effects.coachRelationship, targetType: "RELATIONSHIP", targetId: coach?.id, label: "vztah s trenérem" },
    ].filter((item): item is typeof item & { value: number } => typeof item.value === "number" && item.value !== 0);
    for (const definition of definitions) {
      const repeats = active.effects.filter((item) => item.sourceType === "EVENT" && item.metric === definition.metric).length;
      const magnitude = diminishingMagnitude(definition.value, repeats);
      const effect = await tx.directorCausalEffect.create({ data: { careerId: active.id, sourceType: "EVENT", sourceId: event.id, sourceLabel: `${event.title}: ${selected.label}`, targetType: definition.targetType, targetId: definition.targetId, metric: definition.metric, direction: magnitude > 0 ? "POSITIVE" : "NEGATIVE", magnitude, confidence: .9, startDay: active.dayIndex, endDay: active.dayIndex + (Math.abs(magnitude) >= 5 ? 18 : 10), decay: "EXPONENTIAL", explanation: `${selected.label} bude postupně ovlivňovat ${definition.label}.` } });
      await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "EVENT", sourceId: event.id, effectId: effect.id, category: event.category, headline: `Rozhodnutí vytvořilo ${magnitude > 0 ? "pozitivní" : "negativní"} vliv`, explanation: effect.explanation, targetType: definition.targetType, targetId: definition.targetId, importance: Math.abs(magnitude) >= 5 ? 3 : 2 } });
    }
    if (selected.effects.cash) {
      const direction = selected.effects.cash > 0 ? "IN" : "OUT";
      await tx.directorClub.update({ where: { id: club.id }, data: { cashBalance: club.cashBalance + selected.effects.cash } });
      await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: club.id, dayIndex: active.dayIndex, category: "DECISION", direction, amount: Math.abs(selected.effects.cash), sourceType: "EVENT", sourceId: event.id, description: `${event.title}: ${selected.label}` } });
      await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "EVENT", sourceId: event.id, category: "FINANCE", headline: direction === "IN" ? "Rozhodnutí přineslo příjem" : "Rozhodnutí vytvořilo výdaj", explanation: `${selected.label} změnilo klubovou hotovost o ${Math.abs(selected.effects.cash).toLocaleString("cs-CZ")} EUR.`, targetType: "CLUB", targetId: club.id, importance: 2 } });
    }
    if (choiceKey === "promise" || (event.templateId === "welcome-board" && ["academy", "ambition"].includes(choiceKey))) {
      const commitment = event.templateId === "welcome-board" && choiceKey === "academy"
        ? { stakeholderType: "SUPPORTERS", title: "Otevřít cestu mladým", metric: "YOUTH_MINUTES", target: 300, baseline: 0, dueDay: active.dayIndex + 30, explanation: "Fanoušci očekávají měřitelný prostor pro mladé hráče." }
        : event.templateId === "welcome-board" && choiceKey === "ambition"
          ? { stakeholderType: "BOARD", title: "Okamžitě zvýšit ambice", metric: "LEAGUE_POSITION", target: Math.max(1, Math.ceil(active.clubs.length / 3)), dueDay: active.dayIndex + 30, explanation: "Rada očekává umístění v horní třetině soutěže." }
          : { stakeholderType: event.category === "COACH" ? "COACH" : "PLAYER", title: selected.label, metric: "TRANSFER_COMPLETED", target: 1, baseline: active.negotiations.filter((item) => item.status === "ACCEPTED").length, dueDay: active.dayIndex + 18, explanation: "Veřejný slib se vyhodnotí podle skutečných kroků vedení." };
      await tx.directorCommitment.create({ data: { careerId: active.id, sourceEventId: event.id, tolerance: 0, severity: "HIGH", status: "TRACKING", ...commitment } });
    }

    const pulse = pulseForStory(event, club.name, active.dayIndex, active.worldSeed);
    await tx.directorPulsePost.create({ data: { careerId: active.id, dayIndex: active.dayIndex, topic: event.category, ...pulse } });
    if (event.templateId === "information-leak" && choiceKey === "refuse") await unlock(tx, active.id, ACHIEVEMENTS.cleanHands);
    if (event.templateId === "supporters-ticket-prices" && choiceKey === "freeze") await unlock(tx, active.id, ACHIEVEMENTS.supporterVoice);
  });
  return (await getDirectorWorld(user))!;
}

export async function advanceDirectorDay(user: CurrentUser): Promise<DirectorDTO> {
  let active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  if (active.version < DIRECTOR_WORLD_VERSION) {
    await getDirectorWorld(user);
    active = await loadActive(user);
    if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  }
  const blocking = active.events.find((event) => event.status === "OPEN" && asChoices(event.choices).length > 0);
  if (blocking) throw new Error(`Nejdřív rozhodni: ${blocking.title}`);
  const now = new Date();
  const steps = effectiveSteps(active, now);
  if (steps < 1) throw new Error("Další den se odemkne později.");
  const nextDay = active.dayIndex + 1;
  const nextDate = new Date(active.gameDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const managedClub = active.clubs.find((item) => item.isManaged);
  if (!managedClub) throw new Error("Řízený klub chybí.");

  await prisma.$transaction(async (tx) => {
    await upgradeCausalWorld(tx, active);
    await tx.directorCareer.update({ where: { id: active.id }, data: { dayIndex: nextDay, gameDate: nextDate, availableSteps: steps - 1, lastStepGrantAt: nextGrantAnchor(active, now) } });
    await tx.directorEvent.updateMany({ where: { careerId: active.id, status: "OPEN", choices: { equals: [] } }, data: { status: "RESOLVED", resolvedDay: nextDay, resolvedAt: now } });

    const clubs = await tx.directorClub.findMany({ where: { careerId: active.id }, include: { players: true, coaches: true } });
    const club = clubs.find((item) => item.isManaged)!;
    const coach = club.coaches[0];
    const player = club.players[(nextDay * 7) % club.players.length];
    const sportPolicies = await tx.directorSportPolicy.findMany({ where: { careerId: active.id } });
    const coachMemories = await tx.directorCoachMemory.findMany({ where: { careerId: active.id } });
    const duePayments = await tx.directorTransferPayment.findMany({ where: { careerId: active.id, status: "PENDING", dueDay: { lte: nextDay } } });
    for (const payment of duePayments) {
      const payer = clubs.find((item) => item.id === payment.payerClubId); const payee = clubs.find((item) => item.id === payment.payeeClubId); if (!payer || !payee || payer.cashBalance < payment.amount) continue;
      await tx.directorClub.update({ where: { id: payer.id }, data: { cashBalance: { decrement: payment.amount } } }); await tx.directorClub.update({ where: { id: payee.id }, data: { cashBalance: { increment: payment.amount } } }); await tx.directorTransferPayment.update({ where: { id: payment.id }, data: { status: "PAID", paidDay: nextDay } });
      await tx.directorLedgerEntry.createMany({ data: [{ careerId: active.id, clubId: payer.id, dayIndex: nextDay, category: payment.kind, direction: "OUT", amount: payment.amount, sourceType: "TRANSFER_PAYMENT", sourceId: payment.id, description: "Splatná část přestupní dohody" }, { careerId: active.id, clubId: payee.id, dayIndex: nextDay, category: payment.kind, direction: "IN", amount: payment.amount, sourceType: "TRANSFER_PAYMENT", sourceId: payment.id, description: "Přijatá část přestupní dohody" }] });
    }
    for (const payment of active.transferPayments.filter((item) => item.status === "PENDING" && item.dueDay === null && item.kind === "APPEARANCE_BONUS")) { const condition = payment.condition as { appearances?: number } | null; const transferCase = active.transferCases.find((item) => item.id === payment.caseId); const target = clubs.flatMap((item) => item.players).find((item) => item.id === transferCase?.playerId); if (target && target.appearances >= (condition?.appearances ?? Infinity)) await tx.directorTransferPayment.update({ where: { id: payment.id }, data: { dueDay: nextDay } }); }
    for (const talk of active.contractTalks.filter((item) => item.status === "OPEN" && item.deadlineDay < nextDay)) { await tx.directorContractNegotiation.update({ where: { id: talk.id }, data: { status: "EXPIRED", failureReason: "Vypršel termín smluvního jednání." } }); await tx.directorTransferCase.update({ where: { id: talk.caseId }, data: { status: "EXPIRED", stage: "CLOSED", failureReason: "Vypršel termín smluvního jednání.", reservedAmount: 0 } }); const transferCase = active.transferCases.find((item) => item.id === talk.caseId); if (transferCase?.reservedAmount) await tx.directorClub.update({ where: { id: talk.clubId }, data: { reservedCash: { decrement: transferCase.reservedAmount } } }); }
    for (const transferCase of active.transferCases.filter((item) => item.status === "OPEN" && item.stage === "CLUB" && item.deadlineDay !== null && item.deadlineDay < nextDay)) await tx.directorTransferCase.update({ where: { id: transferCase.id }, data: { status: "EXPIRED", stage: "CLOSED", failureReason: "Vypršel termín klubového jednání." } });
    if (nextDay % 7 === 0) for (const aggregate of clubs.filter((item) => item.simulationMode === "AGGREGATE")) {
      const rand = seeded(hashSeed(active.worldSeed, nextDay, aggregate.id, "aggregate-market-v6")); await tx.directorClub.update({ where: { id: aggregate.id }, data: { currentForm: clamp(aggregate.currentForm * .72 + (rand() - .5) * 8, -15, 15), cashBalance: { increment: Math.round((aggregate.reputation * 9000 - aggregate.weeklyWages) * (.85 + rand() * .3)) }, reputation: clamp(aggregate.reputation + (rand() - .5) * .5, 30, 96) } });
      for (const player of aggregate.players) { const years = Math.max(0, (player.contractUntil.getTime() - active.gameDate.getTime()) / 31_556_952_000); const value = dynamicMarketValue({ ability: player.ability, potential: player.potential, age: player.age, form: player.form, contractYears: years, reputation: aggregate.reputation, interest: player.marketInterest, cashPressure: aggregate.cashBalance < aggregate.weeklyWages * 8 ? 1 : 0 }); await tx.directorPlayer.update({ where: { id: player.id }, data: { marketValue: value, marketInterest: clamp(player.marketInterest * .8 + rand() * 8) } }); }
    }
    for (const transferCase of active.transferCases.filter((item) => item.initiatedBy === "USER" && item.status === "OPEN" && item.stage === "CLUB" && !active.competingBids.some((bid) => bid.caseId === item.id && bid.status === "ACTIVE"))) { const rand = seeded(hashSeed(active.worldSeed, nextDay, transferCase.id, "competing-bid-v6")); if (rand() < .18) { const bidder = clubs.filter((item) => item.id !== transferCase.buyingClubId && item.id !== transferCase.sellingClubId && item.cashBalance > item.weeklyWages * 10).sort((a, b) => b.reputation - a.reputation)[0]; const target = clubs.flatMap((item) => item.players).find((item) => item.id === transferCase.playerId); if (bidder && target) await tx.directorCompetingBid.create({ data: { careerId: active.id, caseId: transferCase.id, bidderClubId: bidder.id, upfront: Math.round(target.marketValue * (.85 + rand() * .25)), guaranteed: Math.round(target.marketValue * (1 + rand() * .2)), playerUtility: .85 + bidder.reputation / 500, expiresDay: nextDay + 4, createdDay: nextDay } }); } }
    await tx.directorCompetingBid.updateMany({ where: { careerId: active.id, status: "ACTIVE", expiresDay: { lt: nextDay } }, data: { status: "EXPIRED" } });
    for (const team of clubs) {
      const coachForPolicy = team.coaches.find((item) => item.status === "ACTIVE") ?? team.coaches[0];
      const stored = sportPolicies.find((item) => item.clubId === team.id);
      const policy = normalizePolicy(stored ? { desiredStyle: stored.desiredStyle as SportingStyle, youthPreference: stored.youthPreference, rotationLevel: stored.rotationLevel, trainingIntensity: stored.trainingIntensity, healthRiskTolerance: stored.healthRiskTolerance, phasePriorities: stored.phasePriorities as Record<(typeof PHASES)[number], number> } : {}, defaultSportingPolicy(coachForPolicy?.philosophy));
      const teamMatches = active.matches.filter((match) => match.homeClubId === team.id || match.awayClubId === team.id); const nextMatch = teamMatches.filter((match) => match.status === "SCHEDULED" && match.scheduledDay >= nextDay).sort((a, b) => a.scheduledDay - b.scheduledDay)[0]; const previousMatch = teamMatches.filter((match) => match.status === "PLAYED" && match.scheduledDay < nextDay).sort((a, b) => b.scheduledDay - a.scheduledDay)[0]; const matchesNextSevenDays = teamMatches.filter((match) => match.status === "SCHEDULED" && match.scheduledDay >= nextDay && match.scheduledDay <= nextDay + 7).length;
      const cycle = chooseMicrocycle({ daysToMatch: nextMatch ? nextMatch.scheduledDay - nextDay : null, daysSinceMatch: previousMatch ? nextDay - previousMatch.scheduledDay : null, matchesNextSevenDays, policy, coachRiskBias: ((coachForPolicy?.interferenceTolerance ?? 50) - 50) / 50 });
      await tx.directorTrainingCycle.upsert({ where: { careerId_clubId_dayIndex: { careerId: active.id, clubId: team.id, dayIndex: nextDay } }, create: { careerId: active.id, clubId: team.id, dayIndex: nextDay, kind: cycle.kind, intensity: cycle.intensity, focus: cycle.focus, congestion: cycle.congestion, effects: { load: cycle.load }, explanation: cycle.explanation }, update: {} });
      if (nextMatch) {
        const opponentId = nextMatch.homeClubId === team.id ? nextMatch.awayClubId : nextMatch.homeClubId;
        const opponentMemory = coachMemoryState(coachMemories.find((item) => item.clubId === opponentId));
        const history = active.matches.filter((match) => match.status === "PLAYED" && match.scheduledDay < nextDay && (match.homeClubId === opponentId || match.awayClubId === opponentId)).sort((a, b) => b.scheduledDay - a.scheduledDay).slice(0, 8);
        const uncertainty = clamp(1 - history.length / 8, .08, .85);
        await tx.directorOpponentAnalysis.upsert({ where: { matchId_clubId: { matchId: nextMatch.id, clubId: team.id } }, create: { careerId: active.id, matchId: nextMatch.id, clubId: team.id, opponentClubId: opponentId, dataCutoffDay: nextDay - 1, sampleSize: history.length, tendencies: { phases: opponentMemory.phaseAssessment, lastFormation: opponentMemory.lastFormation, lastStyle: opponentMemory.lastStyle }, keyDuels: PHASES.slice().sort((a, b) => opponentMemory.phaseAssessment[b] - opponentMemory.phaseAssessment[a]).slice(0, 2), predictability: opponentMemory.predictability, uncertainty, explanation: history.length ? [`Analýza používá pouze ${history.length} utkání odehraných před dnešním dnem.`, "Čitelnost nabízí omezenou přípravu, nikoliv skrytý bonus síly."] : ["Pro spolehlivou analýzu soupeře zatím chybí historie."] }, update: { dataCutoffDay: nextDay - 1, sampleSize: history.length, tendencies: { phases: opponentMemory.phaseAssessment, lastFormation: opponentMemory.lastFormation, lastStyle: opponentMemory.lastStyle }, predictability: opponentMemory.predictability, uncertainty } });
      }
      const medicalStaff = active.staff.find((item) => item.clubId === team.id && item.role === "MEDICAL" && item.status === "ACTIVE");
      for (const squadPlayer of team.players) {
        const update = trainingUpdate(squadPlayer, { ...policy, trainingIntensity: cycle.intensity }, nextDay, active.worldSeed); const health = medicalState({ injuryDays: squadPlayer.injuryDays, fitness: update.fitness, acuteLoad: update.acuteLoad, chronicLoad: update.chronicLoad, previousStatus: squadPlayer.healthStatus, currentDay: nextDay, medicalInformationQuality: medicalStaff?.ability ?? 35, seed: hashSeed(active.worldSeed, squadPlayer.id) }); const familiarity = evolveRoleFamiliarity({ familiarity: squadPlayer.tacticalFamiliarity as Record<string, number>, minutes: 0, tacticalTraining: cycle.kind === "TACTICAL" });
        await tx.directorPlayer.update({ where: { id: squadPlayer.id }, data: { ...update, tacticalFamiliarity: familiarity, healthStatus: health.status, healthIssueType: health.issueType, returnWindowMin: health.estimatedMinDay, returnWindowMax: health.estimatedMaxDay, minutesLimit: health.minutesLimit, recurrenceRisk: health.recurrenceRisk } });
        await tx.directorMedicalReport.upsert({ where: { careerId_playerId_dayIndex: { careerId: active.id, playerId: squadPlayer.id, dayIndex: nextDay } }, create: { careerId: active.id, clubId: team.id, playerId: squadPlayer.id, dayIndex: nextDay, status: health.status, issueType: health.issueType, readiness: health.readiness, recurrenceRisk: health.recurrenceRisk, estimatedMinDay: health.estimatedMinDay, estimatedMaxDay: health.estimatedMaxDay, minutesLimit: health.minutesLimit, uncertainty: health.uncertainty, explanation: health.status === "FIT" ? "Hráč je bez známého omezení." : health.status === "RETURNING" ? "Návrat vyžaduje omezené minuty kvůli riziku recidivy." : "Dostupnost omezuje aktuální zdravotní stav nebo zátěž." }, update: {} });
        Object.assign(squadPlayer, update, { tacticalFamiliarity: familiarity, matchReadiness: health.readiness, healthStatus: health.status, minutesLimit: health.minutesLimit, recurrenceRisk: health.recurrenceRisk });
      }
    }
    const upcomingManaged = active.matches.find((match) => match.status === "SCHEDULED" && match.scheduledDay > nextDay && match.scheduledDay <= nextDay + 2 && (match.homeClubId === club.id || match.awayClubId === club.id));
    if (upcomingManaged) {
      const existingMeeting = await tx.directorSportMeeting.findFirst({ where: { careerId: active.id, matchId: upcomingManaged.id, status: "OPEN" } });
      if (!existingMeeting) {
        const managedPolicy = sportPolicies.find((item) => item.clubId === club.id); const priority = PHASES.slice().sort((a, b) => Number((managedPolicy?.phasePriorities as Record<string, number> | undefined)?.[b] ?? 50) - Number((managedPolicy?.phasePriorities as Record<string, number> | undefined)?.[a] ?? 50))[0];
        await tx.directorSportMeeting.create({ data: { careerId: active.id, clubId: club.id, matchId: upcomingManaged.id, coachId: coach?.id, kind: "PRE_MATCH", trigger: "IMPORTANT_FIXTURE", title: "Předzápasová sportovní porada", briefing: `Trenér připravuje plán na další soutěžní zápas. Dlouhodobá priorita klubu je ${priority.toLowerCase()}.`, recommendation: { phase: priority, action: "KEEP_PLAN" }, createdDay: nextDay, dueDay: upcomingManaged.scheduledDay } });
      }
    }

    const activeEffects = await tx.directorCausalEffect.findMany({ where: { careerId: active.id, status: "ACTIVE", startDay: { lte: nextDay } } });
    const causalDelta = { boardTrust: 0, publicTrust: 0, mediaCredibility: 0, fanTrust: 0, coachTrust: 0 };
    for (const effect of activeEffects) {
      const desired = effectAppliedTotal({ ...effect, decay: effect.decay as "NONE" | "LINEAR" | "EXPONENTIAL" }, nextDay);
      const delta = desired - effect.applied;
      if (Math.abs(delta) > .001) {
        if (effect.targetType === "CAREER") {
          if (effect.metric === "BOARD_TRUST") causalDelta.boardTrust += delta;
          else if (effect.metric === "PUBLIC_TRUST") causalDelta.publicTrust += delta;
          else causalDelta.mediaCredibility += delta;
        } else if (effect.targetType === "CLUB" && effect.targetId) {
          if (effect.targetId === club.id && effect.metric === "FAN_TRUST") causalDelta.fanTrust += delta;
        } else if (effect.targetType === "RELATIONSHIP") {
          causalDelta.coachTrust += delta;
        }
      }
      const completed = effect.endDay !== null && effect.endDay <= nextDay;
      await tx.directorCausalEffect.update({ where: { id: effect.id }, data: { applied: desired, status: completed ? "COMPLETED" : "ACTIVE" } });
      if (completed) await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "EFFECT", sourceId: effect.id, effectId: effect.id, category: "CONSEQUENCE", headline: "Dlouhodobý vliv se naplnil", explanation: effect.explanation, targetType: effect.targetType, targetId: effect.targetId, importance: 2 } });
    }
    if (Object.values(causalDelta).some((value) => Math.abs(value) > .001)) {
      await tx.directorCareer.update({ where: { id: active.id }, data: { boardTrust: clamp(active.boardTrust + causalDelta.boardTrust), publicTrust: clamp(active.publicTrust + causalDelta.publicTrust), mediaCredibility: clamp(active.mediaCredibility + causalDelta.mediaCredibility) } });
      await tx.directorClub.update({ where: { id: club.id }, data: { fanTrust: clamp(club.fanTrust + causalDelta.fanTrust) } });
      if (causalDelta.coachTrust) {
        const relation = active.relationships.find((item) => item.actorType === "COACH");
        if (relation) await tx.directorRelationship.update({ where: { id: relation.id }, data: { trust: clamp(relation.trust + causalDelta.coachTrust), respect: clamp(relation.respect + (causalDelta.coachTrust > 0 ? causalDelta.coachTrust * .35 : causalDelta.coachTrust * .15)) } });
      }
    }

    const dueLedger = await tx.directorLedgerEntry.findMany({ where: { careerId: active.id, status: "PENDING", dueDay: { lte: nextDay } } });
    for (const entry of dueLedger) {
      await tx.directorClub.update({ where: { id: entry.clubId }, data: { cashBalance: { increment: entry.direction === "IN" ? entry.amount : -entry.amount } } });
      await tx.directorLedgerEntry.update({ where: { id: entry.id }, data: { status: "POSTED", dayIndex: nextDay } });
      await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "LEDGER", sourceId: entry.id, category: "FINANCE", headline: entry.direction === "IN" ? "Splatná pohledávka přijata" : "Splatný závazek uhrazen", explanation: entry.description, targetType: "CLUB", targetId: entry.clubId, importance: 2 } });
    }

    if (nextDay % 7 === 0) {
      for (const item of clubs) {
        const staffWages = active.staff.filter((staff) => staff.clubId === item.id && staff.status === "ACTIVE").reduce((sum, staff) => sum + staff.weeklyWage, 0);
        const payroll = item.weeklyWages + staffWages;
        await tx.directorClub.update({ where: { id: item.id }, data: { cashBalance: item.cashBalance - payroll } });
        await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: item.id, dayIndex: nextDay, category: "WAGES", direction: "OUT", amount: payroll, sourceType: "PAYROLL", description: "Týdenní mzdy hráčů a sportovního úseku" } });
      }
    }

    const pendingRegistrations = await tx.directorRegistration.findMany({ where: { careerId: active.id, status: "PENDING", effectiveDay: { lte: nextDay } }, include: { transferCase: true, player: true } });
    for (const registration of pendingRegistrations) {
      const destination = clubs.find((item) => item.id === registration.toClubId);
      const source = clubs.find((item) => item.id === registration.fromClubId);
      if (!destination || !source || destination.players.length >= 28 || source.players.length <= 18) continue;
      const talk = active.contractTalks.find((item) => item.caseId === registration.caseId); const position = talk?.agentPosition as { currentWage?: number } | undefined;
      await tx.directorPlayer.update({ where: { id: registration.playerId }, data: { clubId: destination.id, owningClubId: registration.transferCase.kind === "LOAN" ? source.id : destination.id, loanParentClubId: registration.transferCase.kind === "LOAN" ? source.id : null, transferStatus: "AVAILABLE", cohesion: 35, adaptation: 38 } });
      await tx.directorClub.update({ where: { id: source.id }, data: { weeklyWages: { decrement: position?.currentWage ?? registration.player.weeklyWage } } });
      await tx.directorClub.update({ where: { id: destination.id }, data: { weeklyWages: { increment: registration.player.weeklyWage } } });
      await tx.directorRegistration.update({ where: { id: registration.id }, data: { status: "REGISTERED", registeredAt: now } });
      await tx.directorTransferCase.update({ where: { id: registration.caseId }, data: { status: "COMPLETED" } });
      await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "REGISTRATION", sourceId: registration.id, category: "TRANSFER", headline: `${registration.player.firstName} ${registration.player.lastName} byl registrován`, explanation: "Dohoda vstoupila v účinnost po otevření registračního období. Přestup mění mzdy, hloubku kádru a sehranost obou klubů.", targetType: "PLAYER", targetId: registration.playerId, importance: 3 } });
    }

    if (nextDay % 7 === 0) {
      for (const squadPlayer of clubs.flatMap((item) => item.players)) {
        const rand = seeded(hashSeed(active.worldSeed, nextDay, squadPlayer.id));
        const development = squadPlayer.age <= 23 ? Math.max(0, squadPlayer.potential - squadPlayer.ability) * 0.006 : squadPlayer.age >= 31 ? -0.035 : 0.004;
        await tx.directorPlayer.update({ where: { id: squadPlayer.id }, data: {
          ability: clamp(squadPlayer.ability + development + (rand() - 0.5) * 0.035, 20, squadPlayer.potential),
          form: clamp(squadPlayer.form * .9 + 5), fitness: clamp(squadPlayer.fitness + 3 - squadPlayer.injuryDays * 0.1),
          injuryDays: Math.max(0, squadPlayer.injuryDays - 7),
        } });
      }
      for (const item of clubs) {
        const positions = ["GK", "CB", "CM", "ST"];
        const target = positions.sort((a, b) => averagePosition(item.players, a) - averagePosition(item.players, b))[0];
        const urgency = clamp(75 - averagePosition(item.players, target) + Math.max(0, -item.currentForm), 5, 95);
        const depth = item.players.filter((player) => player.position === target && player.injuryDays <= 0).length; const averageAge = item.players.filter((player) => player.position === target).reduce((sum, player, _, all) => sum + player.age / Math.max(1, all.length), 0); const reason = `${target}: ${depth} dostupní hráči · průměrný věk ${averageAge ? averageAge.toFixed(1) : "—"} · potřeba vznikla z hloubky, kvality, smluv a zdravotní dostupnosti.`;
        await tx.directorClubNeed.upsert({ where: { careerId_clubId_kind_target: { careerId: active.id, clubId: item.id, kind: "SQUAD_POSITION", target } }, create: { careerId: active.id, clubId: item.id, kind: "SQUAD_POSITION", target, desiredRole: target, minAge: 18, maxAge: averageAge > 29 ? 25 : 30, budgetMin: Math.round(item.transferBudget * .15), budgetMax: Math.round(item.transferBudget * .8), tacticalFit: 60, urgency, reason, lastEvaluatedDay: nextDay }, update: { urgency, desiredRole: target, minAge: 18, maxAge: averageAge > 29 ? 25 : 30, budgetMin: Math.round(item.transferBudget * .15), budgetMax: Math.round(item.transferBudget * .8), tacticalFit: 60, reason, lastEvaluatedDay: nextDay, status: "OPEN" } });
      }
    }

    if (nextDay % 7 === 0) await runAiTransferActivity(tx, active, nextDay);

    for (const project of active.projects.filter((item) => item.status === "ACTIVE" && item.finishDay <= nextDay)) {
      const effects = project.effects as { atmosphere?: number; commercial?: number; academy?: number; cash?: number; fanTrust?: number; publicTrust?: number };
      await tx.directorProject.update({ where: { id: project.id }, data: { status: "COMPLETED", completedAt: now } });
      await tx.directorClub.update({ where: { id: club.id }, data: {
        stadiumAtmosphere: { increment: effects.atmosphere ?? 0 },
        stadiumCommercial: { increment: effects.commercial ?? 0 },
        academyLevel: { increment: effects.academy ?? 0 },
        cashBalance: { increment: effects.cash ?? 0 }, fanTrust: { increment: effects.fanTrust ?? 0 },
      } });
      if (effects.publicTrust) await tx.directorCareer.update({ where: { id: active.id }, data: { publicTrust: { increment: effects.publicTrust } } });
      await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "PROJECT", sourceId: project.id, category: "INFRASTRUCTURE", headline: `Dokončeno: ${project.title}`, explanation: "Přínos vznikl až dokončením projektu; další ekonomický dopad bude záviset na návštěvnosti a poptávce.", targetType: "CLUB", targetId: club.id, importance: 3 } });
      await tx.directorPulsePost.create({ data: { careerId: active.id, dayIndex: nextDay, authorType: "CLUB", authorName: club.name, tone: "OFFICIAL", body: `${project.title} je dokončen. Klubový areál se mění podle schválené dlouhodobé strategie.`, topic: "STADIUM", trust: 100, reach: 7800, relatedType: "PROJECT", relatedId: project.id } });
    }

    const dueMatches = await tx.directorMatch.findMany({ where: { careerId: active.id, scheduledDay: nextDay, status: "SCHEDULED" } });
    for (const dueMatch of dueMatches) {
      const home = clubs.find((item) => item.id === dueMatch.homeClubId);
      const away = clubs.find((item) => item.id === dueMatch.awayClubId);
      if (home && away) {
        const storedHomePolicy = sportPolicies.find((item) => item.clubId === home.id);
        const storedAwayPolicy = sportPolicies.find((item) => item.clubId === away.id);
        const policyForMatch = (stored: typeof storedHomePolicy, teamId: string) => {
          if (!stored) return undefined;
          const memory = coachMemoryState(coachMemories.find((item) => item.clubId === teamId));
          const policyPriorities = stored.phasePriorities as Record<(typeof PHASES)[number], number>;
          const priorities = Object.fromEntries(PHASES.map((phase) => [phase, policyPriorities[phase] * .65 + memory.phaseAssessment[phase] * .35])) as Record<(typeof PHASES)[number], number>;
          const meeting = active.sportMeetings.find((item) => item.matchId === dueMatch.id && item.clubId === teamId && item.status === "RESOLVED");
          const response = meeting?.response as { phaseDelta?: number } | null;
          const recommendation = meeting?.recommendation as { phase?: (typeof PHASES)[number] } | null;
          if (response?.phaseDelta && recommendation?.phase && PHASES.includes(recommendation.phase)) {
            const donor = PHASES.filter((phase) => phase !== recommendation.phase).sort((a, b) => priorities[b] - priorities[a])[0];
            const delta = clamp(response.phaseDelta, -3, 3);
            priorities[recommendation.phase] += delta;
            priorities[donor] -= delta;
          }
          return { ...stored, desiredStyle: stored.desiredStyle as SportingStyle, phasePriorities: priorities };
        };
        for (const [team, opponent] of [[home, away], [away, home]] as const) {
          const history = active.matches.filter((match) => match.status === "PLAYED" && match.scheduledDay < nextDay && (match.homeClubId === opponent.id || match.awayClubId === opponent.id)).sort((a, b) => b.scheduledDay - a.scheduledDay).slice(0, 8);
          const opponentPlans = history.map((match) => active.matchPlans.find((plan) => plan.matchId === match.id && plan.clubId === opponent.id)).filter(Boolean);
          const formations = opponentPlans.reduce<Record<string, number>>((counts, plan) => { counts[plan!.formation] = (counts[plan!.formation] ?? 0) + 1; return counts; }, {});
          const opponentMemory = coachMemoryState(coachMemories.find((item) => item.clubId === opponent.id));
          const sampleSize = history.length;
          const uncertainty = clamp(1 - sampleSize / 8, .08, .85);
          await tx.directorOpponentAnalysis.upsert({
            where: { matchId_clubId: { matchId: dueMatch.id, clubId: team.id } },
            create: { careerId: active.id, matchId: dueMatch.id, clubId: team.id, opponentClubId: opponent.id, version: 1, dataCutoffDay: nextDay - 1, sampleSize, tendencies: { formations, phases: opponentMemory.phaseAssessment }, keyDuels: PHASES.slice().sort((a, b) => opponentMemory.phaseAssessment[b] - opponentMemory.phaseAssessment[a]).slice(0, 2), predictability: opponentMemory.predictability, uncertainty, explanation: sampleSize ? [`Analýza vychází z ${sampleSize} dříve odehraných utkání.`, "Vyšší čitelnost pomáhá přípravě, ale nemění kvalitu kádru."] : ["Soupeře zatím nelze spolehlivě přečíst." ] },
            update: {},
          });
        }
        const played = simulateDirectorMatch({ seed: active.worldSeed, day: nextDay, round: dueMatch.round, home, away, homePolicy: policyForMatch(storedHomePolicy, home.id), awayPolicy: policyForMatch(storedAwayPolicy, away.id) });
        await tx.directorMatch.update({ where: { id: dueMatch.id }, data: { status: "PLAYED", engineVersion: 5, homeGoals: played.homeGoals, awayGoals: played.awayGoals, homeXg: played.homeXg, awayXg: played.awayXg, homeStrength: played.homeStrength, awayStrength: played.awayStrength, timeline: played.timeline, phaseStats: played.phaseStats, coachReport: played.coachReport, playedAt: now } });
        const savedPlans = new Map<string, { id: string; costs: ReturnType<typeof systemCosts> }>();
        for (const [side, team, plan, stored] of [["HOME", home, played.homePlan, storedHomePolicy], ["AWAY", away, played.awayPlan, storedAwayPolicy]] as const) {
          const coachForTeam = team.coaches.find((item) => item.status === "ACTIVE") ?? team.coaches[0];
          const memory = coachMemoryState(coachMemories.find((item) => item.clubId === team.id && item.coachId === coachForTeam?.id));
          const costs = systemCosts({ previous: memory, formation: plan.formation, style: stored?.desiredStyle ?? "BALANCED", phases: plan.phases });
          const saved = await tx.directorMatchPlan.create({ data: { careerId: active.id, matchId: dueMatch.id, clubId: team.id, coachId: coachForTeam?.id, side, formation: plan.formation, mentality: plan.mentality, lineup: plan.lineup as unknown as Prisma.InputJsonValue, bench: plan.bench as unknown as Prisma.InputJsonValue, roles: Object.fromEntries(plan.lineup.map((item) => [item.playerId, item.role])), phaseProfile: plan.phases, selectionReasons: plan.reasons, weaknesses: plan.weaknesses, confidence: plan.confidence, familiarity: costs.familiarity, predictability: costs.predictability, cohesionCost: costs.cohesionCost, changeMagnitude: costs.changeMagnitude, uncertainty: memory.confidence < .45 ? ["omezený vzorek trenérské paměti"] : [], engineVersion: 5, createdDay: nextDay, lockedAt: now } });
          savedPlans.set(team.id, { id: saved.id, costs });
        }
        for (const [team, appearances] of [[home, played.homeAppearances], [away, played.awayAppearances]] as const) for (const appearance of appearances) {
          await tx.directorPlayerAppearance.create({ data: { careerId: active.id, matchId: dueMatch.id, clubId: team.id, ...appearance } });
          const squadPlayer = team.players.find((item) => item.id === appearance.playerId);
          const familiarity = squadPlayer ? evolveRoleFamiliarity({ familiarity: squadPlayer.tacticalFamiliarity as Record<string, number>, usedRole: appearance.role, minutes: appearance.minutes, tacticalTraining: false }) : undefined;
          await tx.directorPlayer.update({ where: { id: appearance.playerId }, data: { appearances: { increment: 1 }, minutes: { increment: appearance.minutes }, acuteLoad: { increment: appearance.load }, fitness: { decrement: appearance.load * .16 }, tacticalFamiliarity: familiarity, injuryDays: appearance.injuryDays || undefined, healthStatus: appearance.injuryDays ? "ACUTE_INJURY" : undefined, healthIssueType: appearance.injuryDays ? "ACUTE" : undefined, returnDay: appearance.injuryDays ? nextDay + appearance.injuryDays : undefined } });
        }
        for (const [team, opponent, plan, xgFor, xgAgainst, goalsFor, goalsAgainst] of [[home, away, played.homePlan, played.homeXg, played.awayXg, played.homeGoals, played.awayGoals], [away, home, played.awayPlan, played.awayXg, played.homeXg, played.awayGoals, played.homeGoals]] as const) {
          const coachForTeam = team.coaches.find((item) => item.status === "ACTIVE") ?? team.coaches[0];
          if (!coachForTeam) continue;
          const phasePerformance = Object.fromEntries(PHASES.map((phase) => [phase, clamp(plan.phases[phase] + (xgFor - xgAgainst) * 8, 20, 80)]));
          const evidence: MatchEvidence = { day: nextDay, phases: phasePerformance, xgFor, xgAgainst, points: goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0, opponentStrength: (opponent.baseAttack + 1 / Math.max(.2, opponent.baseDefense)) * 22, ownStrength: (team.baseAttack + 1 / Math.max(.2, team.baseDefense)) * 22, formation: plan.formation, style: (team.id === home.id ? storedHomePolicy?.desiredStyle : storedAwayPolicy?.desiredStyle) ?? "BALANCED" };
          const analytics = active.staff.find((item) => item.clubId === team.id && item.role === "ANALYTICS" && item.status === "ACTIVE");
          const previous = coachMemoryState(coachMemories.find((item) => item.clubId === team.id && item.coachId === coachForTeam.id));
          const result = updateCoachMemory({ previous, evidence: [evidence], adaptability: coachForTeam.adaptability, analyticsQuality: analytics?.ability ?? 35, seed: hashSeed(active.worldSeed, nextDay, team.id) });
          const saved = savedPlans.get(team.id);
          await tx.directorPlanReview.create({ data: { careerId: active.id, matchId: dueMatch.id, clubId: team.id, coachId: coachForTeam.id, planId: saved?.id, version: 1, phasePerformance, execution: clamp(50 + (xgFor - xgAgainst) * 12), finishingLuck: (goalsFor - goalsAgainst) - (xgFor - xgAgainst), lessons: [`${result.adaptation.strengthened} vyžaduje větší pozornost.`, `${result.adaptation.reduced} uvolní stejnou část omezeného taktického rozpočtu.`], adaptation: result.adaptation, confidence: result.memory.confidence, createdDay: nextDay } });
          await tx.directorCoachMemory.upsert({ where: { careerId_clubId_coachId: { careerId: active.id, clubId: team.id, coachId: coachForTeam.id } }, create: { careerId: active.id, clubId: team.id, coachId: coachForTeam.id, phaseAssessment: result.memory.phaseAssessment, tacticalBudget: result.memory.tacticalBudget, systemFamiliarity: saved?.costs.familiarity ?? previous.systemFamiliarity, predictability: saved?.costs.predictability ?? previous.predictability, lastFormation: plan.formation, lastStyle: evidence.style, recentPlans: result.memory.recentPlans, confidence: result.memory.confidence, updatedDay: nextDay }, update: { version: { increment: 1 }, phaseAssessment: result.memory.phaseAssessment, systemFamiliarity: saved?.costs.familiarity ?? previous.systemFamiliarity, predictability: saved?.costs.predictability ?? previous.predictability, lastFormation: plan.formation, lastStyle: evidence.style, recentPlans: result.memory.recentPlans, confidence: result.memory.confidence, updatedDay: nextDay } });
          if (saved?.costs.cohesionCost) await tx.directorClub.update({ where: { id: team.id }, data: { cohesion: { decrement: saved.costs.cohesionCost * .08 } } });
        }
        for (const [team, lineupIds] of [] as unknown as ReadonlyArray<readonly [typeof home, string[]]>) {
          const injuryRandom = seeded(hashSeed(active.worldSeed, nextDay, dueMatch.id, team.id, "injury"));
          const averageFitness = team.players.filter((item) => lineupIds.includes(item.id)).reduce((sum, item) => sum + item.fitness, 0) / Math.max(1, lineupIds.length);
          const hazard = clamp(.018 + Math.max(0, 82 - averageFitness) * .0015 - team.medicalLevel * .0015, .006, .065);
          if (injuryRandom() < hazard && lineupIds.length) {
            const injuredId = lineupIds[Math.floor(injuryRandom() * lineupIds.length)];
            const days = 4 + Math.floor(injuryRandom() * 18);
            await tx.directorPlayer.update({ where: { id: injuredId }, data: { injuryDays: days, fitness: { decrement: 8 } } });
            if (team.isManaged) {
              const injured = team.players.find((item) => item.id === injuredId);
              await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "MATCH", sourceId: dueMatch.id, category: "INJURY", headline: `${injured?.firstName ?? "Hráč"} ${injured?.lastName ?? ""} se zranil`, explanation: `Zátěž v utkání a aktuální kondice vedly k absenci přibližně ${days} dní. Zdravotní úroveň klubu riziko snížila, ale neodstranila.`, targetType: "PLAYER", targetId: injuredId, importance: 3 } });
            }
          }
        }
        const attendance = Math.round(home.stadiumCapacity * clamp(home.stadiumAttendance + home.fanTrust / 500 + (away.baseAttack + away.baseDefense) / 30, .35, .99));
        const matchIncome = Math.round(attendance * (13 + home.stadiumCommercial * .16));
        await tx.directorClub.update({ where: { id: home.id }, data: { cashBalance: { increment: matchIncome }, stadiumAttendance: attendance / home.stadiumCapacity } });
        await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: home.id, dayIndex: nextDay, category: "MATCHDAY", direction: "IN", amount: matchIncome, sourceType: "MATCH", sourceId: dueMatch.id, description: `Vstupné a provoz utkání proti ${away.name}` } });
        if (home.isManaged || away.isManaged) {
          await tx.directorPulsePost.create({ data: { careerId: active.id, dayIndex: nextDay, authorType: "CLUB", authorName: club.name, tone: "OFFICIAL", body: `${home.name} ${played.homeGoals}:${played.awayGoals} ${away.name}. ${played.coachReport.headline}.`, topic: "MATCH", trust: 100, reach: 9000, relatedType: "MATCH", relatedId: dueMatch.id } });
          await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "MATCH", sourceId: dueMatch.id, category: "SPORT", headline: played.coachReport.headline, explanation: played.coachReport.summary, targetType: "CLUB", targetId: club.id, importance: 3 } });
        }
      }
    }

    const allMatches = await tx.directorMatch.findMany({ where: { careerId: active.id } });
    const detailedClubs = clubs.filter((item) => item.simulationMode === "DETAIL");
    const rows = tableRows(detailedClubs, allMatches);
    const season = await tx.directorSeason.findFirst({ where: { careerId: active.id, status: "ACTIVE" }, orderBy: { number: "desc" } });
    if (season) {
      for (const row of rows) await tx.directorStanding.upsert({ where: { seasonId_clubId: { seasonId: season.id, clubId: row.clubId } }, create: { seasonId: season.id, ...row }, update: row });
      const currentRound = Math.max(0, ...allMatches.filter((item) => item.status === "PLAYED").map((item) => item.round));
      await tx.directorSeason.update({ where: { id: season.id }, data: { currentRound } });
    }
    for (const item of clubs) {
      const recent = allMatches.filter((match) => match.status === "PLAYED" && (match.homeClubId === item.id || match.awayClubId === item.id)).sort((a, b) => b.scheduledDay - a.scheduledDay).slice(0, 8).reverse();
      const inputs = recent.map((match) => { const home = match.homeClubId === item.id; const gf = home ? match.homeGoals! : match.awayGoals!; const ga = home ? match.awayGoals! : match.homeGoals!; const opponent = clubs.find((candidate) => candidate.id === (home ? match.awayClubId : match.homeClubId)); return { points: gf > ga ? 3 : gf === ga ? 1 : 0, xgFor: home ? match.homeXg ?? gf : match.awayXg ?? gf, xgAgainst: home ? match.awayXg ?? ga : match.homeXg ?? ga, opponentStrength: opponent ? (opponent.baseAttack + 1 / Math.max(.2, opponent.baseDefense)) * 22 : 55 }; });
      const form = weightedForm(inputs);
      const recentPoints = inputs.slice(-5).reduce((sum, item) => sum + item.points, 0);
      await tx.directorClub.update({ where: { id: item.id }, data: { currentForm: form, morale: clamp(item.morale * .88 + 7 + recentPoints * .28), cohesion: clamp(item.cohesion + (recent.length ? .35 : .1)) } });
    }

    const managedMatches = allMatches.filter((item) => item.status === "PLAYED" && (item.homeClubId === club.id || item.awayClubId === club.id)).length;
    for (const expectation of active.expectations) {
      const squadPlayer = clubs.flatMap((item) => item.players).find((item) => item.id === expectation.playerId);
      if (!squadPlayer) continue;
      const owner = clubs.find((item) => item.players.some((candidate) => candidate.id === squadPlayer.id));
      const teamMatches = owner?.isManaged ? managedMatches : allMatches.filter((item) => item.status === "PLAYED" && (item.homeClubId === owner?.id || item.awayClubId === owner?.id)).length;
      const result = playerExpectation({ promisedRole: expectation.expectedRole, appearances: squadPlayer.appearances, minutes: squadPlayer.minutes, availableTeamMatches: teamMatches, injuryDays: squadPlayer.injuryDays, currentStage: expectation.escalationStage, morale: squadPlayer.morale });
      await tx.directorPlayerExpectation.update({ where: { id: expectation.id }, data: { actualMinuteShare: result.actualShare, escalationStage: result.nextStage, status: result.status, reasons: [result.reason], lastEvaluatedDay: nextDay } });
      if (result.moraleDelta) await tx.directorPlayer.update({ where: { id: squadPlayer.id }, data: { morale: clamp(squadPlayer.morale + result.moraleDelta), transferStatus: result.nextStage >= 4 ? "REQUESTED_TRANSFER" : squadPlayer.transferStatus } });
      if (owner?.isManaged && result.nextStage > expectation.escalationStage && result.nextStage >= 2) await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "PLAYER_EXPECTATION", sourceId: expectation.id, category: "SQUAD", headline: `${squadPlayer.firstName} ${squadPlayer.lastName}: ${result.status === "TRANSFER_REQUEST" ? "žádost o přestup" : "nespokojenost s rolí"}`, explanation: result.reason, targetType: "PLAYER", targetId: squadPlayer.id, importance: result.nextStage >= 4 ? 3 : 2 } });
    }

    const activeSeason = await tx.directorSeason.findFirst({ where: { careerId: active.id, status: "ACTIVE" }, orderBy: { number: "desc" } });
    if (activeSeason) {
      const managedRow = rows.find((item) => item.clubId === club.id);
      const position = Math.max(1, rows.findIndex((item) => item.clubId === club.id) + 1);
      const liabilities = await tx.directorLedgerEntry.aggregate({ where: { careerId: active.id, clubId: club.id, status: "PENDING", direction: "OUT" }, _sum: { amount: true } });
      const youthMinutes = club.players.filter((item) => item.age <= 21).reduce((sum, item) => sum + item.minutes, 0);
      const projectCount = await tx.directorProject.count({ where: { careerId: active.id, clubId: club.id, status: "COMPLETED" } });
      const objectiveValues: Record<string, number> = { SPORTING: position, FINANCE: club.cashBalance - (liabilities._sum.amount ?? 0), ACADEMY: youthMinutes, INFRASTRUCTURE: projectCount };
      for (const objective of active.objectives.filter((item) => item.seasonId === activeSeason.id)) {
        const value = objectiveValues[objective.kind] ?? 0;
        const fulfilled = objective.kind === "SPORTING" ? value <= objective.target : value >= objective.target;
        await tx.directorSeasonObjective.update({ where: { id: objective.id }, data: { progress: value, status: fulfilled ? "ON_TRACK" : nextDay >= activeSeason.endDay * .75 ? "AT_RISK" : "TRACKING" } });
      }
      const reviewKind = nextDay === Math.floor((activeSeason.startDay + activeSeason.endDay) / 2) ? "MIDSEASON" : nextDay === Math.floor(activeSeason.endDay * .75) ? "WINTER" : null;
      if (reviewKind && managedRow) {
        const review = boardReview({ position, clubs: detailedClubs.length, expectedPosition: Math.ceil(detailedClubs.length * .55), expectedPoints: managedRow.expectedPoints, actualPoints: managedRow.points, cash: club.cashBalance, liabilities: liabilities._sum.amount ?? 0, youthMinutes, academyTarget: 900, completedProjects: projectCount });
        await tx.directorBoardReview.upsert({ where: { seasonId_clubId_kind: { seasonId: activeSeason.id, clubId: club.id, kind: reviewKind } }, create: { careerId: active.id, seasonId: activeSeason.id, clubId: club.id, kind: reviewKind, dayIndex: nextDay, ...review, explanation: [`Výsledky a výkony: ${Math.round(review.sporting)}/100`, `Finance: ${Math.round(review.finance)}/100`, `Akademie: ${Math.round(review.academy)}/100`] }, update: {} });
      }
    }

    const commitments = await tx.directorCommitment.findMany({ where: { careerId: active.id, status: { in: ["TRACKING", "ON_TRACK", "AT_RISK"] } } });
    for (const commitment of commitments) {
      const row = rows.find((item) => item.clubId === club.id);
      const position = Math.max(1, rows.findIndex((item) => item.clubId === club.id) + 1);
      const accepted = await tx.directorNegotiation.count({ where: { careerId: active.id, status: "ACCEPTED" } });
      const youthMinutes = club.players.filter((item) => item.age <= 21).reduce((sum, item) => sum + item.minutes, 0);
      const value = commitment.metric === "LEAGUE_POSITION" ? position : commitment.metric === "YOUTH_MINUTES" ? youthMinutes : commitment.metric === "TRANSFER_COMPLETED" ? accepted - (commitment.baseline ?? 0) : row?.points ?? 0;
      const state = commitmentState({ value, target: commitment.target, tolerance: commitment.tolerance, dueDay: commitment.dueDay, day: nextDay, higherIsBetter: commitment.metric !== "LEAGUE_POSITION" });
      const final = state === "FULFILLED" || state === "BROKEN";
      await tx.directorCommitment.update({ where: { id: commitment.id }, data: { progress: value, status: state, resolvedAt: final ? now : null } });
      if (final) {
        const positive = state === "FULFILLED";
        const relation = await tx.directorRelationship.findFirst({ where: { careerId: active.id, actorType: commitment.stakeholderType } });
        if (relation) await tx.directorRelationship.update({ where: { id: relation.id }, data: { trust: clamp(relation.trust + (positive ? 5 : -7)), credibility: clamp(relation.credibility + (positive ? 4 : -8)), conflicts: clamp(relation.conflicts + (positive ? -1 : 3)) } });
        await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: nextDay, sourceType: "COMMITMENT", sourceId: commitment.id, category: "PROMISE", headline: positive ? "Závazek byl splněn" : "Závazek nebyl dodržen", explanation: commitment.explanation, importance: 3 } });
      }
    }

    const hasBlockingEvent = await tx.directorEvent.count({ where: { careerId: active.id, status: "OPEN", severity: { in: ["DECISION", "CRISIS"] } } });
    const unresolvedRisks = await tx.directorCommitment.count({ where: { careerId: active.id, status: "AT_RISK" } });
    if (!hasBlockingEvent && (nextDay % 3 === 0 || unresolvedRisks > 0)) {
      const recentTemplates = await tx.directorEvent.findMany({ where: { careerId: active.id }, orderBy: { createdDay: "desc" }, take: 8, select: { templateId: true } });
      const topNeed = await tx.directorClubNeed.findFirst({ where: { careerId: active.id, clubId: club.id, status: "OPEN" }, orderBy: { urgency: "desc" } });
      const story = buildStory({ seed: active.worldSeed, day: nextDay, clubName: club.name, coachName: coach?.name ?? "trenér", playerName: player ? `${player.firstName} ${player.lastName}` : "hráč", cash: club.cashBalance, boardTrust: active.boardTrust, fanTrust: club.fanTrust, recentTemplates: recentTemplates.map((item) => item.templateId), ethicsMode: active.ethicsMode, weakPositionUrgency: topNeed?.urgency, unhappyPlayer: club.players.some((item) => item.morale < 45 || (item.promisedRole === "STARTER" && item.appearances < Math.max(1, Math.floor(nextDay / 6)))), attendance: club.stadiumAttendance, activeProject: active.projects.some((item) => item.status === "ACTIVE"), activeNegotiation: active.negotiations.some((item) => item.status === "OPEN"), cashPressure: club.cashBalance < club.weeklyWages * 6 });
      const created = await tx.directorEvent.create({ data: { careerId: active.id, templateId: story.templateId, category: story.category, severity: story.severity, title: story.title, body: story.body, choices: story.choices as unknown as Prisma.InputJsonValue, dueDay: story.dueDay, memoryTags: story.memoryTags, createdDay: nextDay, payload: { trigger: unresolvedRisks > 0 ? "COMMITMENT_RISK" : "WORLD_STATE" } } });
      const pulse = pulseForStory(story, club.name, nextDay, active.worldSeed);
      await tx.directorPulsePost.create({ data: { careerId: active.id, dayIndex: nextDay, topic: story.category, relatedType: "EVENT", relatedId: created.id, ...pulse } });
    }
    if (nextDay === 1) await unlock(tx, active.id, ACHIEVEMENTS.firstDay);
  }, { timeout: 30_000 });
  return (await getDirectorWorld(user))!;
}

export async function markDirectorAchievementsSeen(user: CurrentUser): Promise<DirectorDTO> {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  await prisma.directorAchievement.updateMany({ where: { careerId: active.id, seenAt: null }, data: { seenAt: new Date() } });
  return (await getDirectorWorld(user))!;
}

export async function openDirectorNegotiation(user: CurrentUser, playerId: string): Promise<DirectorDTO> {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const managed = active.clubs.find((club) => club.isManaged)!;
  const seller = active.clubs.find((club) => club.players.some((player) => player.id === playerId));
  const player = seller?.players.find((item) => item.id === playerId);
  if (!seller || !player || seller.id === managed.id) throw new Error("Hráč není na trhu dostupný.");
  const existing = active.negotiations.find((item) => item.playerId === playerId && item.status === "OPEN");
  if (existing) return toDTO(active, Boolean(await prisma.gameSave.findUnique({ where: { email: ownerKey(user) } })));
  const rand = seeded(hashSeed(active.worldSeed, player.id, active.dayIndex, "negotiation"));
  const priorities = { upfront: 0.45 + rand() * .3, certainty: 0.35 + rand() * .35, replacement: player.promisedRole === "STARTER" ? .8 : .35 };
  const playerPriorities = { wage: player.weeklyWage * (1.15 + rand() * .35), years: player.age < 27 ? 4 : 2, role: player.ability >= 72 ? "STARTER" : "ROTATION" };
  await prisma.directorNegotiation.create({ data: { careerId: active.id, playerId, sellingClubId: seller.id, referenceValue: player.marketValue, clubPriorities: priorities, playerPriorities } });
  return (await getDirectorWorld(user))!;
}

export async function submitDirectorOffer(user: CurrentUser, negotiationId: string, offer: { upfront: number; installments: number; bonuses: number; sellOn: number; weeklyWage: number; years: number; promisedRole: string }): Promise<DirectorDTO> {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const negotiation = active.negotiations.find((item) => item.id === negotiationId && item.status === "OPEN");
  if (!negotiation) throw new Error("Jednání už není otevřené.");
  const managed = active.clubs.find((club) => club.isManaged)!;
  const seller = active.clubs.find((club) => club.id === negotiation.sellingClubId)!;
  const player = seller.players.find((item) => item.id === negotiation.playerId)!;
  if (offer.upfront > managed.cashBalance || offer.upfront < 0 || offer.installments < 0 || offer.bonuses < 0 || offer.sellOn < 0 || offer.sellOn > 35) throw new Error("Nabídka neodpovídá finančním pravidlům klubu.");
  const clubPriorities = negotiation.clubPriorities as { upfront: number; certainty: number; replacement: number };
  const playerPriorities = negotiation.playerPriorities as { wage: number; years: number; role: string };
  const guaranteed = offer.upfront + offer.installments * .82;
  const conditional = offer.bonuses * .35 + negotiation.referenceValue * (offer.sellOn / 100) * .22;
  const clubScore = (guaranteed + conditional) / negotiation.referenceValue + (offer.upfront / Math.max(1, guaranteed)) * clubPriorities.upfront * .15 - clubPriorities.replacement * .08;
  const wageScore = offer.weeklyWage / Math.max(1, playerPriorities.wage);
  const roleOk = offer.promisedRole === playerPriorities.role || offer.promisedRole === "STARTER";
  const accepted = clubScore >= 1.02 && wageScore >= .98 && roleOk && offer.years >= Math.max(1, playerPriorities.years - 1);
  const nextRound = negotiation.round + 1;
  const patience = negotiation.patience - 1;
  const response = accepted
    ? `Dohoda je hotová. ${seller.name} přijal strukturu nabídky a hráč souhlasil s rolí i smlouvou.`
    : clubScore < .9 ? `Celková garantovaná hodnota je příliš nízká. ${seller.name} oceňuje bonusy méně než jistou platbu.`
      : offer.upfront / Math.max(1, guaranteed) < clubPriorities.upfront ? "Prodávající klub požaduje větší část ceny okamžitě, aby mohl hledat náhradu."
        : wageScore < .98 ? "Kluby jsou blízko dohodě, ale hráčův agent odmítá navrženou mzdu."
          : !roleOk ? "Hráč požaduje významnější sportovní roli. Vyšší přestupová částka tento problém nevyřeší."
            : "Struktura je blízko, ale prodávající klub chce větší jistotu místo podmíněných bonusů.";
  const history = Array.isArray(negotiation.history) ? negotiation.history : [];

  await prisma.$transaction(async (tx) => {
    await tx.directorNegotiation.update({ where: { id: negotiation.id }, data: { round: nextRound, patience: Math.max(0, patience), status: accepted ? "ACCEPTED" : patience <= 0 ? "REJECTED" : "OPEN", lastOffer: offer, response, history: [...history, { round: nextRound, offer, response }] as Prisma.InputJsonValue } });
    if (accepted) {
      await tx.directorPlayer.update({ where: { id: player.id }, data: { clubId: managed.id, weeklyWage: offer.weeklyWage, promisedRole: offer.promisedRole, contractUntil: new Date(Date.UTC(active.gameDate.getUTCFullYear() + offer.years, 5, 30)), morale: clamp(player.morale + 6), cohesion: 35 } });
      await tx.directorClub.update({ where: { id: managed.id }, data: { cashBalance: managed.cashBalance - offer.upfront, transferBudget: Math.max(0, managed.transferBudget - offer.upfront), weeklyWages: managed.weeklyWages + offer.weeklyWage } });
      await tx.directorClub.update({ where: { id: seller.id }, data: { cashBalance: seller.cashBalance + offer.upfront, weeklyWages: Math.max(0, seller.weeklyWages - player.weeklyWage) } });
      await tx.directorLedgerEntry.createMany({ data: [
        { careerId: active.id, clubId: managed.id, dayIndex: active.dayIndex, category: "TRANSFER", direction: "OUT", amount: offer.upfront, sourceType: "NEGOTIATION", sourceId: negotiation.id, description: `Okamžitá platba za ${player.firstName} ${player.lastName}` },
        ...(offer.installments > 0 ? [30, 60, 90].map((offset) => ({ careerId: active.id, clubId: managed.id, dayIndex: active.dayIndex, category: "TRANSFER_INSTALLMENT", direction: "OUT", amount: Math.round(offer.installments / 3), status: "PENDING", dueDay: active.dayIndex + offset, sourceType: "NEGOTIATION", sourceId: negotiation.id, description: `Splátka za ${player.firstName} ${player.lastName}` })) : []),
        ...(offer.bonuses > 0 ? [{ careerId: active.id, clubId: managed.id, dayIndex: active.dayIndex, category: "TRANSFER_BONUS", direction: "OUT", amount: offer.bonuses, status: "CONDITIONAL", dueDay: active.dayIndex + 180, sourceType: "NEGOTIATION", sourceId: negotiation.id, description: `Podmíněný bonus za ${player.firstName} ${player.lastName}` }] : []),
      ] });
      await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "NEGOTIATION", sourceId: negotiation.id, category: "TRANSFER", headline: `${player.firstName} ${player.lastName} posílil klub`, explanation: `Přestup mění kvalitu kádru, mzdové náklady a budoucí cash flow. Okamžitá platba činí ${offer.upfront.toLocaleString("cs-CZ")} EUR.`, targetType: "CLUB", targetId: managed.id, importance: 3 } });
      await tx.directorPulsePost.create({ data: { careerId: active.id, dayIndex: active.dayIndex, authorType: "CLUB", authorName: managed.name, tone: "OFFICIAL", body: `${player.firstName} ${player.lastName} přestupuje z ${seller.name}. Nabídka kombinuje jistou platbu a dlouhodobé podmínky.`, topic: "TRANSFER", trust: 100, reach: 12000, relatedType: "PLAYER", relatedId: player.id } });
    }
  });
  return (await getDirectorWorld(user))!;
}

export async function startDirectorProject(user: CurrentUser, kind: "ATMOSPHERE" | "COMMERCIAL" | "ACADEMY"): Promise<DirectorDTO> {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const club = active.clubs.find((item) => item.isManaged)!;
  if (active.projects.some((project) => project.status === "ACTIVE")) throw new Error("Klub už jeden infrastrukturní projekt realizuje.");
  const definition = {
    ATMOSPHERE: { title: "Modernizace kotle a tribun", cost: 450_000, days: 18, effects: { atmosphere: 8, fanTrust: 3 } },
    COMMERCIAL: { title: "Hospitality a komerční zázemí", cost: 700_000, days: 24, effects: { commercial: 10, cash: 120_000 } },
    ACADEMY: { title: "Rozšíření akademie", cost: 620_000, days: 28, effects: { academy: 1, publicTrust: 2 } },
  }[kind];
  if (club.cashBalance < definition.cost) throw new Error("Klub nemá pro projekt dostatečnou hotovost.");
  await prisma.$transaction([
    prisma.directorClub.update({ where: { id: club.id }, data: { cashBalance: club.cashBalance - definition.cost } }),
    prisma.directorProject.create({ data: { careerId: active.id, clubId: club.id, kind, title: definition.title, startedDay: active.dayIndex, finishDay: active.dayIndex + definition.days, cost: definition.cost, effects: definition.effects } }),
    prisma.directorLedgerEntry.create({ data: { careerId: active.id, clubId: club.id, dayIndex: active.dayIndex, category: "INFRASTRUCTURE", direction: "OUT", amount: definition.cost, sourceType: "PROJECT", description: definition.title } }),
    prisma.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "PROJECT", category: "INFRASTRUCTURE", headline: `Projekt zahájen: ${definition.title}`, explanation: `Přínos se projeví až po dokončení v herním dni ${active.dayIndex + definition.days + 1}.`, targetType: "CLUB", targetId: club.id, importance: 2 } }),
  ]);
  return (await getDirectorWorld(user))!;
}

export async function manageDirectorCoach(user: CurrentUser, command: "SUPPORT" | "WARN" | "SHARED_AUTHORITY" | "DIRECTOR_AUTHORITY" | "DISMISS") {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const club = active.clubs.find((item) => item.isManaged)!;
  const coach = club.coaches.find((item) => item.status === "ACTIVE") ?? club.coaches[0];
  if (!coach) throw new Error("Klub nemá aktivního trenéra.");
  await prisma.$transaction(async (tx) => {
    if (command === "DISMISS") {
      const severance = coach.weeklyWage * Math.max(4, coach.severanceMonths * 4);
      if (club.cashBalance < severance) throw new Error("Klub nemá hotovost na odstupné trenéra.");
      await tx.directorCoach.update({ where: { id: coach.id }, data: { status: "DISMISSED", relationship: clamp(coach.relationship - 35) } });
      await tx.directorClub.update({ where: { id: club.id }, data: { cashBalance: { decrement: severance } } });
      await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: club.id, dayIndex: active.dayIndex, category: "COACH_SEVERANCE", direction: "OUT", amount: severance, sourceType: "COACH", sourceId: coach.id, description: `Odstupné po odvolání trenéra ${coach.name}` } });
    } else {
      const authority = command === "SHARED_AUTHORITY" ? "CONSULT" : command === "DIRECTOR_AUTHORITY" ? "DIRECTOR" : coach.transferAuthority;
      const relationship = clamp(coach.relationship + (command === "SUPPORT" ? 4 : command === "WARN" ? -6 : command === "SHARED_AUTHORITY" ? 1 : -3));
      await tx.directorCoach.update({ where: { id: coach.id }, data: { transferAuthority: authority, relationship } });
    }
    await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "COACH_DECISION", sourceId: coach.id, category: "COACH", headline: command === "DISMISS" ? `${coach.name} byl odvolán` : `Mandát trenéra byl upraven`, explanation: command === "SUPPORT" ? "Veřejná podpora posílila důvěru, současně zvýšila odpovědnost za dohodnuté cíle." : command === "WARN" ? "Varování zvýšilo tlak na výsledky a kabinu; jeho dopad závisí na vztahu a oprávněnosti kritiky." : command === "DISMISS" ? "Odvolání vytvořilo odstupné, nejistotu v kabině a nutnost výběru nástupce." : "Rozdělení přestupních pravomocí se změnilo; trenér bude další rozhodnutí posuzovat podle původního mandátu.", targetType: "COACH", targetId: coach.id, importance: command === "DISMISS" ? 4 : 2 } });
  });
  return (await getDirectorWorld(user))!;
}

export async function updateDirectorPlayer(user: CurrentUser, playerId: string, command: "LIST" | "UNLIST" | "RENEW", role?: "STARTER" | "ROTATION" | "SQUAD") {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const club = active.clubs.find((item) => item.isManaged)!;
  const player = club.players.find((item) => item.id === playerId);
  if (!player) throw new Error("Hráč nepatří do řízeného klubu.");
  if (command === "RENEW") {
    const expectation = active.expectations.find((item) => item.playerId === player.id);
    const agent = active.agents.find((item) => item.id === player.agentId);
    const wage = Math.round(player.weeklyWage * (1.08 + (agent?.ambition ?? 55) / 500));
    const bonus = wage * 8;
    if (club.cashBalance < bonus) throw new Error("Klub nemá hotovost na podpisový bonus.");
    await prisma.$transaction([
      prisma.directorPlayer.update({ where: { id: player.id }, data: { weeklyWage: wage, promisedRole: role ?? player.promisedRole, contractUntil: new Date(Date.UTC(active.gameDate.getUTCFullYear() + 3, 5, 30)), morale: { increment: 4 } } }),
      prisma.directorPlayerExpectation.update({ where: { playerId: player.id }, data: { expectedRole: role ?? player.promisedRole, targetMinuteShare: targetMinuteShare(role ?? player.promisedRole), wageSatisfaction: clamp((expectation?.wageSatisfaction ?? 55) + 18), willingness: clamp((expectation?.willingness ?? 65) + 12), escalationStage: 0, status: "SETTLED" } }),
      prisma.directorClub.update({ where: { id: club.id }, data: { cashBalance: { decrement: bonus }, weeklyWages: { increment: wage - player.weeklyWage } } }),
      prisma.directorLedgerEntry.create({ data: { careerId: active.id, clubId: club.id, dayIndex: active.dayIndex, category: "SIGNING_BONUS", direction: "OUT", amount: bonus, sourceType: "PLAYER_CONTRACT", sourceId: player.id, description: `Podpisový bonus: ${player.firstName} ${player.lastName}` } }),
    ]);
  } else await prisma.directorPlayer.update({ where: { id: player.id }, data: { transferStatus: command === "LIST" ? "LISTED" : "AVAILABLE" } });
  return (await getDirectorWorld(user))!;
}

export async function openDirectorTransferCase(user: CurrentUser, playerId: string, kind: "PERMANENT" | "LOAN") {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const buyer = active.clubs.find((item) => item.isManaged)!;
  const seller = active.clubs.find((item) => item.players.some((player) => player.id === playerId));
  if (!seller || seller.id === buyer.id) throw new Error("Hráč není pro příchozí jednání dostupný.");
  const existing = active.transferCases.find((item) => item.playerId === playerId && item.buyingClubId === buyer.id && item.status === "OPEN");
  if (!existing) await prisma.directorTransferCase.create({ data: { careerId: active.id, playerId, sellingClubId: seller.id, buyingClubId: buyer.id, kind, initiatedBy: "USER", stage: "CLUB", patience: 4, deadlineDay: active.dayIndex + 8 } });
  return (await getDirectorWorld(user))!;
}

export async function submitDirectorTransferOffer(user: CurrentUser, caseId: string, offer: { upfront: number; installments: number; bonuses: number; sellOn: number; loanFee: number; optionFee?: number; weeklyWage: number; years: number; promisedRole: string }) {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const transferCase = active.transferCases.find((item) => item.id === caseId && item.status === "OPEN");
  if (!transferCase) throw new Error("Přestupní jednání už není otevřené.");
  const seller = active.clubs.find((item) => item.id === transferCase.sellingClubId)!;
  const buyer = active.clubs.find((item) => item.id === transferCase.buyingClubId)!;
  const player = seller.players.find((item) => item.id === transferCase.playerId)!;
  const expectation = active.expectations.find((item) => item.playerId === player.id);
  if (transferCase.stage !== "CLUB" || (transferCase.deadlineDay !== null && transferCase.deadlineDay < active.dayIndex)) throw new Error("Klubová fáze jednání už skončila.");
  const projection = cashFlowProjection({ cash: buyer.cashBalance, reservedCash: buyer.reservedCash, weeklyWages: buyer.weeklyWages, wageBudget: buyer.wageBudget, upfront: offer.upfront, signingBonus: 0, agentFee: 0, futurePayments: [offer.installments], incoming: [] });
  if (!projection.sustainable || [offer.upfront, offer.installments, offer.bonuses, offer.loanFee, offer.weeklyWage].some((item) => item < 0)) throw new Error("Nabídka není udržitelná podle hotovosti a budoucích závazků.");
  const sellerCoach = seller.coaches.find((item) => item.status === "ACTIVE"); const veto = Boolean(sellerCoach?.transferVeto && player.promisedRole === "STARTER" && seller.cashBalance > seller.weeklyWages * 10);
  const result = transferOfferUtility({ marketValue: player.marketValue, ...offer, offeredWage: offer.weeklyWage, offeredYears: offer.years, importance: player.promisedRole === "STARTER" ? 1 : .45, sellerCashPressure: seller.cashBalance < seller.weeklyWages * 8 ? 1 : .15, replacementDifficulty: seller.players.filter((item) => item.position === player.position && item.id !== player.id).length < 2 ? .9 : .3, rivalry: 0, currentWage: player.weeklyWage, targetYears: player.age < 28 ? 4 : 2, roleFit: offer.promisedRole === (expectation?.expectedRole ?? player.promisedRole) || offer.promisedRole === "STARTER" ? 1 : .55, clubAmbitionFit: clamp((buyer.reputation + 25) / Math.max(40, seller.reputation + 25), .65, 1.15) });
  const round = transferCase.offers.length + 1;
  const clubAccepted = result.seller >= 1 && !veto; const response = veto ? "Trenér využil sjednané veto: klub bez připravené náhrady oporu neuvolní." : clubAccepted ? "Kluby se dohodly. Nyní je nutné samostatně vyjednat smlouvu s hráčem." : result.reason;
  await prisma.$transaction(async (tx) => {
    await tx.directorTransferOffer.create({ data: { caseId, round, submittedByClubId: buyer.id, ...offer, sellerUtility: result.seller, playerUtility: result.player, response } });
    if (!clubAccepted) { await tx.directorTransferCase.update({ where: { id: caseId }, data: { patience: { decrement: 1 }, failureReason: response } }); return; }
    const agent = active.agents.find((item) => item.id === player.agentId);
    await tx.directorTransferCase.update({ where: { id: caseId }, data: { stage: "CONTRACT", reservedAmount: offer.upfront, failureReason: null } });
    await tx.directorClub.update({ where: { id: buyer.id }, data: { reservedCash: { increment: offer.upfront } } });
    await tx.directorContractNegotiation.create({ data: { careerId: active.id, caseId, playerId: player.id, clubId: buyer.id, deadlineDay: Math.min(transferCase.deadlineDay ?? active.dayIndex + 7, active.dayIndex + 5), agentPosition: { currentWage: player.weeklyWage, expectedWage: Math.round(player.weeklyWage * (1.1 + (agent?.ambition ?? 55) / 500)), desiredYears: player.age < 28 ? 4 : 2, desiredShare: targetMinuteShare(expectation?.expectedRole ?? player.promisedRole), alternatives: active.competingBids.filter((item) => item.caseId === caseId && item.status === "ACTIVE").length } } });
  });
  return (await getDirectorWorld(user))!;
}

export async function submitDirectorContractOffer(user: CurrentUser, negotiationId: string, offer: { weeklyWage: number; years: number; signingBonus: number; appearanceBonus: number; goalBonus: number; releaseClause?: number; promisedRole: string; promisedShare: number; agentFee: number }) {
  const active = await loadActive(user); if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const talk = active.contractTalks.find((item) => item.id === negotiationId && item.status === "OPEN"); if (!talk || talk.deadlineDay < active.dayIndex) throw new Error("Smluvní jednání už není otevřené.");
  const transferCase = active.transferCases.find((item) => item.id === talk.caseId && item.stage === "CONTRACT"); if (!transferCase) throw new Error("Přestup není ve smluvní fázi.");
  const buyer = active.clubs.find((item) => item.id === talk.clubId)!; const seller = active.clubs.find((item) => item.id === transferCase.sellingClubId)!; const player = seller.players.find((item) => item.id === talk.playerId)!; const agent = active.agents.find((item) => item.id === player.agentId); const position = talk.agentPosition as { expectedWage?: number; desiredYears?: number; desiredShare?: number; alternatives?: number };
  const projection = cashFlowProjection({ cash: buyer.cashBalance, reservedCash: Math.max(0, buyer.reservedCash - transferCase.reservedAmount), weeklyWages: buyer.weeklyWages + offer.weeklyWage, wageBudget: buyer.wageBudget, upfront: transferCase.reservedAmount, signingBonus: offer.signingBonus, agentFee: offer.agentFee, futurePayments: [], incoming: [] });
  if (!projection.sustainable) throw new Error("Smlouva by vytvořila neudržitelný stav hotovosti nebo mezd.");
  const result = contractOfferUtility({ wage: offer.weeklyWage, expectedWage: position.expectedWage ?? player.weeklyWage * 1.15, years: offer.years, desiredYears: position.desiredYears ?? 3, signingBonus: offer.signingBonus, agentFee: offer.agentFee, promisedShare: offer.promisedShare, desiredShare: position.desiredShare ?? .55, clubReputation: buyer.reputation, currentReputation: seller.reputation, competition: buyer.simulationMode === "DETAIL" ? 60 : buyer.reputation, alternatives: position.alternatives ?? 0, agentAmbition: agent?.ambition ?? 55, credibility: active.publicTrust });
  const round = talk.offers.length + 1; const accepted = result.accepted; await prisma.$transaction(async (tx) => {
    await tx.directorContractOffer.create({ data: { negotiationId, round, ...offer, playerUtility: result.utility, response: result.reason, accepted } });
    if (!accepted) { const patience = talk.patience - 1; await tx.directorContractNegotiation.update({ where: { id: talk.id }, data: { round, patience, status: patience <= 0 ? "FAILED" : "OPEN", failureReason: result.reason } }); if (patience <= 0) { await tx.directorTransferCase.update({ where: { id: transferCase.id }, data: { status: "REJECTED", stage: "CLOSED", failureReason: result.reason, reservedAmount: 0 } }); await tx.directorClub.update({ where: { id: buyer.id }, data: { reservedCash: { decrement: transferCase.reservedAmount } } }); } return; }
    const clubOffer = transferCase.offers.at(-1)!; const window = transferWindow(active.dayIndex, active.seasons[0]?.rules); if (window.registrationDay === null) throw new Error("V sezonních pravidlech chybí registrační období.");
    await tx.directorContractNegotiation.update({ where: { id: talk.id }, data: { round, status: "AGREED", failureReason: null } });
    await tx.directorTransferCase.update({ where: { id: transferCase.id }, data: { status: "AGREED", stage: "REGISTRATION", playerAgreement: "AGREED", agreedDay: active.dayIndex, registrationDay: window.registrationDay, reservedAmount: 0 } });
    await tx.directorRegistration.create({ data: { careerId: active.id, caseId: transferCase.id, playerId: player.id, fromClubId: seller.id, toClubId: buyer.id, effectiveDay: window.registrationDay } });
    await tx.directorPlayer.update({ where: { id: player.id }, data: { transferStatus: "AGREED", weeklyWage: offer.weeklyWage, promisedRole: offer.promisedRole, adaptation: 38, contractUntil: new Date(Date.UTC(active.gameDate.getUTCFullYear() + offer.years, 5, 30)) } });
    await tx.directorClub.update({ where: { id: buyer.id }, data: { cashBalance: { decrement: clubOffer.upfront + offer.signingBonus + offer.agentFee }, reservedCash: { decrement: transferCase.reservedAmount }, transferBudget: { decrement: Math.min(buyer.transferBudget, clubOffer.upfront) } } });
    await tx.directorClub.update({ where: { id: seller.id }, data: { cashBalance: { increment: clubOffer.upfront } } });
    for (const [kind, amount, payee] of [["UPFRONT", clubOffer.upfront, seller.id], ["SIGNING_BONUS", offer.signingBonus, player.id], ["AGENT_FEE", offer.agentFee, agent?.id ?? player.id]] as const) if (amount > 0) await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: buyer.id, dayIndex: active.dayIndex, category: kind, direction: "OUT", amount, sourceType: "TRANSFER_CASE", sourceId: transferCase.id, description: `${kind}: ${player.firstName} ${player.lastName} · ${payee}` } });
    if (clubOffer.upfront > 0) await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: seller.id, dayIndex: active.dayIndex, category: "TRANSFER", direction: "IN", amount: clubOffer.upfront, sourceType: "TRANSFER_CASE", sourceId: transferCase.id, description: `Okamžitá platba za ${player.firstName} ${player.lastName}` } });
    if (clubOffer.installments > 0) for (let part = 1; part <= 3; part++) await tx.directorTransferPayment.create({ data: { careerId: active.id, caseId: transferCase.id, payerClubId: buyer.id, payeeClubId: seller.id, kind: "INSTALLMENT", amount: Math.round(clubOffer.installments / 3), dueDay: active.dayIndex + part * 30 } });
    if (clubOffer.bonuses > 0) await tx.directorTransferPayment.create({ data: { careerId: active.id, caseId: transferCase.id, payerClubId: buyer.id, payeeClubId: seller.id, kind: "APPEARANCE_BONUS", amount: clubOffer.bonuses, condition: { appearances: 20 } } });
    if (clubOffer.sellOn > 0) await tx.directorTransferClause.create({ data: { careerId: active.id, caseId: transferCase.id, playerId: player.id, beneficiaryClubId: seller.id, kind: "SELL_ON", value: clubOffer.sellOn } });
    if (offer.releaseClause) await tx.directorTransferClause.create({ data: { careerId: active.id, caseId: transferCase.id, playerId: player.id, beneficiaryClubId: player.id, kind: "RELEASE", value: offer.releaseClause } });
    await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "TRANSFER_CASE", sourceId: transferCase.id, category: "TRANSFER", headline: `Osobní podmínky dohodnuty: ${player.firstName} ${player.lastName}`, explanation: `Registrace proběhne v herní den ${window.registrationDay + 1}. Okamžité a budoucí závazky byly zaúčtovány odděleně.`, targetType: "PLAYER", targetId: player.id, importance: 3 } });
  });
  return (await getDirectorWorld(user))!;
}

export async function scoutDirectorPlayer(user: CurrentUser, playerId: string) {
  const active = await loadActive(user); if (!active) throw new Error("Aktivní kariéra nebyla nalezena."); const club = active.clubs.find((item) => item.isManaged)!; const player = active.clubs.flatMap((item) => item.players).find((item) => item.id === playerId); if (!player || player.clubId === club.id) throw new Error("Hráče nelze scoutovat."); const staff = informationQuality(active.staff.filter((item) => item.clubId === club.id), "SCOUTING"); const report = scoutingSnapshot({ seed: active.worldSeed, day: active.dayIndex, playerId, ability: player.ability, potential: player.potential, value: player.marketValue, wage: player.weeklyWage, scoutingQuality: staff.quality, tacticalFit: roleScores(player)[Object.keys(roleScores(player))[0]] ?? 50 }); const previous = active.scoutingReports.filter((item) => item.requestingClubId === club.id && item.playerId === playerId).length;
  await prisma.directorScoutingReport.create({ data: { careerId: active.id, requestingClubId: club.id, playerId, dayIndex: active.dayIndex, version: previous + 1, ...report, expiresDay: active.dayIndex + 30, explanation: [staff.uncertainty === "LOW" ? "Skautský tým má vysokou jistotu." : "Rozsah zůstává širší kvůli omezené kvalitě nebo vytížení scoutingu."] } }); return (await getDirectorWorld(user))!;
}

export async function updateDirectorShortlist(user: CurrentUser, playerId: string, command: "ADD" | "REMOVE", priority = 2) {
  const active = await loadActive(user); if (!active) throw new Error("Aktivní kariéra nebyla nalezena."); const club = active.clubs.find((item) => item.isManaged)!; const player = active.clubs.flatMap((item) => item.players).find((item) => item.id === playerId); if (!player || player.clubId === club.id) throw new Error("Hráč není dostupný pro shortlist.");
  if (command === "REMOVE") await prisma.directorShortlistEntry.deleteMany({ where: { careerId: active.id, clubId: club.id, playerId } }); else await prisma.directorShortlistEntry.upsert({ where: { careerId_clubId_playerId: { careerId: active.id, clubId: club.id, playerId } }, create: { careerId: active.id, clubId: club.id, playerId, priority: clamp(priority, 1, 3) }, update: { priority: clamp(priority, 1, 3), status: "WATCHING" } }); return (await getDirectorWorld(user))!;
}

export async function resolveIncomingTransfer(user: CurrentUser, caseId: string, decision: "ACCEPT" | "REJECT") {
  const active = await loadActive(user); if (!active) throw new Error("Aktivní kariéra nebyla nalezena."); const managed = active.clubs.find((item) => item.isManaged)!; const transferCase = active.transferCases.find((item) => item.id === caseId && item.sellingClubId === managed.id && item.initiatedBy === "AI" && item.status === "OPEN"); if (!transferCase) throw new Error("Příchozí nabídka už není otevřená."); const player = managed.players.find((item) => item.id === transferCase.playerId)!; const buyer = active.clubs.find((item) => item.id === transferCase.buyingClubId)!; const offer = transferCase.offers.at(-1)!;
  if (decision === "REJECT") { await prisma.directorTransferCase.update({ where: { id: caseId }, data: { status: "REJECTED", stage: "CLOSED", failureReason: "Vedení prodávajícího klubu nabídku odmítlo." } }); return (await getDirectorWorld(user))!; }
  const coach = managed.coaches.find((item) => item.status === "ACTIVE"); if (coach?.transferVeto && player.promisedRole === "STARTER") throw new Error("Trenér má smluvní veto na odchod opory."); if (managed.players.length <= 18) throw new Error("Prodej by porušil minimální velikost kádru."); if (transferCase.playerAgreement !== "AGREED") throw new Error("Hráč se s kupujícím klubem nedohodl na osobních podmínkách."); const window = transferWindow(active.dayIndex, active.seasons[0]?.rules); if (window.registrationDay === null) throw new Error("Chybí další registrační období.");
  await prisma.$transaction(async (tx) => { await tx.directorTransferCase.update({ where: { id: caseId }, data: { status: "AGREED", stage: "REGISTRATION", agreedDay: active.dayIndex, registrationDay: window.registrationDay } }); await tx.directorRegistration.create({ data: { careerId: active.id, caseId, playerId: player.id, fromClubId: managed.id, toClubId: buyer.id, effectiveDay: window.registrationDay } }); await tx.directorPlayer.update({ where: { id: player.id }, data: { transferStatus: "AGREED" } }); await tx.directorClub.update({ where: { id: buyer.id }, data: { cashBalance: { decrement: offer.upfront }, transferBudget: { decrement: Math.min(buyer.transferBudget, offer.upfront) } } }); await tx.directorClub.update({ where: { id: managed.id }, data: { cashBalance: { increment: offer.upfront } } }); await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: managed.id, dayIndex: active.dayIndex, category: "TRANSFER", direction: "IN", amount: offer.upfront, sourceType: "TRANSFER_CASE", sourceId: caseId, description: `Přijatá nabídka za ${player.firstName} ${player.lastName}` } }); }); return (await getDirectorWorld(user))!;
}

export async function manageDirectorStaff(user: CurrentUser, staffId: string, command: "HIRE" | "FIRE") {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const club = active.clubs.find((item) => item.isManaged)!;
  const staff = active.staff.find((item) => item.id === staffId);
  if (!staff) throw new Error("Zaměstnanec nebyl nalezen.");
  if (command === "HIRE") {
    if (staff.status !== "CANDIDATE" || staff.clubId) throw new Error("Kandidát už není dostupný.");
    const current = active.staff.find((item) => item.clubId === club.id && item.role === staff.role && item.status === "ACTIVE");
    const compensation = current ? current.weeklyWage * 8 : 0;
    if (club.cashBalance < compensation) throw new Error("Klub nemá hotovost na personální změnu.");
    await prisma.$transaction(async (tx) => {
      if (current) await tx.directorStaff.update({ where: { id: current.id }, data: { status: "DISMISSED", clubId: null } });
      await tx.directorStaff.update({ where: { id: staff.id }, data: { status: "ACTIVE", clubId: club.id, relationship: 62, workload: 25 } });
      if (compensation) await tx.directorClub.update({ where: { id: club.id }, data: { cashBalance: { decrement: compensation } } });
      await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "STAFF", sourceId: staff.id, category: "STAFF", headline: `${staff.name} přebírá oddělení ${staff.role}`, explanation: "Personální změna upraví přesnost a nejistotu konkrétních podkladů. Sama o sobě nepřidává sportovní bonus.", targetType: "CLUB", targetId: club.id, importance: 2 } });
    });
  } else {
    if (staff.clubId !== club.id || staff.status !== "ACTIVE") throw new Error("Lze propustit pouze aktivního zaměstnance klubu.");
    const compensation = staff.weeklyWage * 8;
    await prisma.$transaction([prisma.directorStaff.update({ where: { id: staff.id }, data: { status: "CANDIDATE", clubId: null, relationship: { decrement: 20 } } }), prisma.directorClub.update({ where: { id: club.id }, data: { cashBalance: { decrement: compensation } } }), prisma.directorLedgerEntry.create({ data: { careerId: active.id, clubId: club.id, dayIndex: active.dayIndex, category: "STAFF_SEVERANCE", direction: "OUT", amount: compensation, sourceType: "STAFF", sourceId: staff.id, description: `Odstupné: ${staff.name}` } })]);
  }
  return (await getDirectorWorld(user))!;
}

export async function openDirectorCoachNegotiation(user: CurrentUser, candidateId: string) {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const club = active.clubs.find((item) => item.isManaged)!;
  const candidate = active.coachCandidates.find((item) => item.id === candidateId && item.status === "AVAILABLE");
  if (!candidate) throw new Error("Trenér už není dostupný.");
  const existing = active.coachNegotiations.find((item) => item.candidateId === candidateId && item.status === "OPEN");
  if (!existing) await prisma.directorCoachNegotiation.create({ data: { careerId: active.id, clubId: club.id, candidateId, proposedTerms: { weeklyWage: candidate.wageDemand, years: 3, transferAuthority: "CONSULT", transferVeto: false, youthTarget: .12, minimumPatienceDays: 24 } } });
  return (await getDirectorWorld(user))!;
}

export async function submitDirectorCoachOffer(user: CurrentUser, negotiationId: string, terms: { weeklyWage: number; years: number; transferAuthority: string; transferVeto: boolean; youthTarget: number; minimumPatienceDays: number }) {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const negotiation = active.coachNegotiations.find((item) => item.id === negotiationId && item.status === "OPEN");
  const candidate = active.coachCandidates.find((item) => item.id === negotiation?.candidateId);
  const club = active.clubs.find((item) => item.isManaged)!;
  if (!negotiation || !candidate) throw new Error("Trenérské jednání není otevřené.");
  const authorityFit = terms.transferAuthority === "COACH" ? 1.08 : terms.transferAuthority === "CONSULT" ? 1 : .82;
  const wageFit = terms.weeklyWage / Math.max(1, candidate.wageDemand);
  const patienceFit = Math.min(1.1, terms.minimumPatienceDays / 24);
  const score = wageFit * .55 + authorityFit * .25 + patienceFit * .12 + (terms.transferVeto ? .08 : 0);
  const accepted = score >= 1 && terms.years >= 2;
  const round = negotiation.round + 1;
  const patience = negotiation.patience - 1;
  const response = accepted ? "Kandidát přijal sportovní mandát i smluvní podmínky." : wageFit < .95 ? "Požadovaná mzda neodpovídá reputaci a alternativám kandidáta." : authorityFit < .9 ? "Kandidát požaduje větší vliv na skladbu kádru." : "Mandát je blízko dohodě, ale kandidát žádá větší jistotu času a cílů.";
  const history = Array.isArray(negotiation.history) ? negotiation.history : [];
  await prisma.$transaction(async (tx) => {
    await tx.directorCoachNegotiation.update({ where: { id: negotiation.id }, data: { round, patience: Math.max(0, patience), status: accepted ? "ACCEPTED" : patience <= 0 ? "REJECTED" : "OPEN", proposedTerms: terms, response, history: [...history, { round, terms, response }] as Prisma.InputJsonValue } });
    if (!accepted) return;
    const current = club.coaches.find((item) => item.status === "ACTIVE");
    if (current) await tx.directorCoach.update({ where: { id: current.id }, data: { status: "DISMISSED" } });
    await tx.directorCoach.create({ data: { clubId: club.id, name: candidate.name, philosophy: candidate.philosophy, formation: candidate.formation, adaptability: 60, youthDevelopment: candidate.youthDevelopment, manManagement: candidate.manManagement, matchManagement: candidate.matchManagement, relationship: 64, transferAuthority: terms.transferAuthority, transferVeto: terms.transferVeto, contractUntil: new Date(Date.UTC(active.gameDate.getUTCFullYear() + terms.years, 5, 30)), weeklyWage: terms.weeklyWage, personality: candidate.personality, reputation: candidate.reputation, ambition: candidate.ambition, interferenceTolerance: terms.transferAuthority === "DIRECTOR" ? 38 : 65, preferredRoles: ["CB", "CM", "ST"], mandate: { budget: club.transferBudget, philosophy: candidate.philosophy, youthTarget: terms.youthTarget, transferAuthority: terms.transferAuthority, veto: terms.transferVeto, minimumPatienceDays: terms.minimumPatienceDays } } });
    await tx.directorCoachCandidate.update({ where: { id: candidate.id }, data: { status: "HIRED" } });
  });
  return (await getDirectorWorld(user))!;
}

export async function rolloverDirectorSeason(user: CurrentUser): Promise<DirectorDTO> {
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
  const season = active.seasons[0];
  if (!season || season.status !== "ACTIVE") throw new Error("Aktivní sezona nebyla nalezena.");
  if (active.matches.some((item) => item.seasonId === season.id && item.status === "SCHEDULED")) throw new Error("Sezonu lze uzavřít až po odehrání celého rozpisu.");
  const managed = active.clubs.find((item) => item.isManaged)!;
  const detailed = active.clubs.filter((item) => item.simulationMode === "DETAIL");
  const rows = [...season.standings].sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
  const managedRow = rows.find((item) => item.clubId === managed.id)!;
  const position = rows.findIndex((item) => item.clubId === managed.id) + 1;
  const liabilities = active.ledger.filter((item) => item.status === "PENDING" && item.direction === "OUT").reduce((sum, item) => sum + item.amount, 0);
  const youthMinutes = managed.players.filter((item) => item.age <= 21).reduce((sum, item) => sum + item.minutes, 0);
  const review = boardReview({ position, clubs: detailed.length, expectedPosition: Math.ceil(detailed.length * .55), expectedPoints: managedRow.expectedPoints, actualPoints: managedRow.points, cash: managed.cashBalance, liabilities, youthMinutes, academyTarget: 900, completedProjects: active.projects.filter((item) => item.status === "COMPLETED").length });
  const nextNumber = season.number + 1;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.directorSeason.findUnique({ where: { careerId_number: { careerId: active.id, number: nextNumber } } });
    if (existing) return;
    await tx.directorBoardReview.upsert({ where: { seasonId_clubId_kind: { seasonId: season.id, clubId: managed.id, kind: "FINAL" } }, create: { careerId: active.id, seasonId: season.id, clubId: managed.id, kind: "FINAL", dayIndex: active.dayIndex, ...review, explanation: [`Sportovní hodnocení ${Math.round(review.sporting)}/100`, `Finance ${Math.round(review.finance)}/100`, `Akademie ${Math.round(review.academy)}/100`] }, update: {} });
    await tx.directorSeason.update({ where: { id: season.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    const reward = Math.round(250_000 + (detailed.length - position + 1) * 85_000);
    await tx.directorClub.update({ where: { id: managed.id }, data: { cashBalance: { increment: reward }, transferBudget: { increment: Math.round(reward * .55) } } });
    await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: managed.id, dayIndex: active.dayIndex, category: "SEASON_REWARD", direction: "IN", amount: reward, sourceType: "SEASON", sourceId: season.id, description: `Odměna za ${position}. místo` } });
    await tx.directorPlayer.updateMany({ where: { club: { careerId: active.id } }, data: { age: { increment: 1 }, appearances: 0, minutes: 0, form: 50 } });
    const schedule = roundRobinSchedule(detailed.map((item) => item.id));
    const startDay = active.dayIndex + 7;
    const endDay = startDay + Math.max(...schedule.map((item) => item.scheduledDay)) + 7;
    const next = await tx.directorSeason.create({ data: { careerId: active.id, number: nextNumber, startDay, endDay, rules: seasonRules(endDay) } });
    await tx.directorStanding.createMany({ data: detailed.map((item) => ({ seasonId: next.id, clubId: item.id })) });
    await tx.directorMatch.createMany({ data: schedule.map((item) => ({ careerId: active.id, seasonId: next.id, ...item, scheduledDay: startDay + item.scheduledDay })) });
    await tx.directorSeasonObjective.createMany({ data: [
      { careerId: active.id, seasonId: next.id, clubId: managed.id, kind: "SPORTING", target: Math.max(1, Math.ceil(detailed.length * .5)), weight: .5, explanation: "Umístění relativně k síle a minulému výsledku klubu." },
      { careerId: active.id, seasonId: next.id, clubId: managed.id, kind: "FINANCE", target: 0, weight: .25, explanation: "Kladná hotovost po odečtení splatných závazků." },
      { careerId: active.id, seasonId: next.id, clubId: managed.id, kind: "ACADEMY", target: 1000, weight: .15, explanation: "Soutěžní minuty hráčů do 21 let." },
      { careerId: active.id, seasonId: next.id, clubId: managed.id, kind: "INFRASTRUCTURE", target: 1, weight: .1, explanation: "Dokončený dlouhodobý projekt." },
    ] });
    await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "SEASON", sourceId: season.id, category: "CAREER", headline: `Sezona ${season.number} uzavřena: ${position}. místo`, explanation: `Rada oddělila sportovní výsledek, finance, akademii a infrastrukturu. Nový rozpis i rozpočty byly vytvořeny právě jednou.`, targetType: "CAREER", targetId: active.id, importance: 4 } });
    if (review.outcome === "DISMISSAL") {
      await tx.directorCareer.update({ where: { id: active.id }, data: { boardTrust: clamp(active.boardTrust - 25), identityTags: [...asStringArray(active.identityTags), "odvolán radou"] } });
      for (const candidate of active.clubs.filter((item) => !item.isManaged).sort((a, b) => Math.abs(a.tier - managed.tier) - Math.abs(b.tier - managed.tier)).slice(0, 3)) await tx.directorJobOffer.create({ data: { careerId: active.id, clubId: candidate.id, expiresDay: active.dayIndex + 14, terms: { transferBudget: candidate.transferBudget, expectation: candidate.boardExpectation } } });
    }
  }, { timeout: 30_000 });
  return (await getDirectorWorld(user))!;
}

export async function updateDirectorSportPolicy(user: CurrentUser, input: { desiredStyle: SportingStyle; youthPreference: number; rotationLevel: number; trainingIntensity: number; healthRiskTolerance: number; phasePriorities: Record<string, number> }) {
  const active = await loadActive(user); if (!active) throw new Error("Aktivní kariéra nebyla nalezena."); const club = active.clubs.find((item) => item.isManaged); if (!club) throw new Error("Řízený klub chybí.");
  const policy = normalizePolicy({ ...input, phasePriorities: input.phasePriorities as Record<(typeof PHASES)[number], number> });
  await prisma.$transaction(async (tx) => { await tx.directorSportPolicy.upsert({ where: { careerId_clubId: { careerId: active.id, clubId: club.id } }, create: { careerId: active.id, clubId: club.id, ...policy, updatedDay: active.dayIndex }, update: { ...policy, version: { increment: 1 }, updatedDay: active.dayIndex } }); await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "SPORT_POLICY", category: "SPORT", headline: "Sportovní politika byla upravena", explanation: "Jde o dlouhodobé zadání trenérovi, nikoliv o přímý taktický pokyn. Dopad vznikne přes jeho plán, vhodnost kádru a mandát.", targetType: "CLUB", targetId: club.id, importance: 2 } }); });
  return (await getDirectorWorld(user))!;
}

export async function resolveDirectorSportMeeting(user: CurrentUser, meetingId: string, choice: "SUPPORT" | "REQUEST_PRIORITY" | "INSIST_MANDATE") {
  const active = await loadActive(user); if (!active) throw new Error("Aktivní kariéra nebyla nalezena."); const meeting = active.sportMeetings.find((item) => item.id === meetingId && item.status === "OPEN"); if (!meeting) throw new Error("Sportovní porada již není otevřená."); const club = active.clubs.find((item) => item.id === meeting.clubId)!; const coach = club.coaches.find((item) => item.id === meeting.coachId) ?? club.coaches.find((item) => item.status === "ACTIVE")!; const recommendation = meeting.recommendation as { phase?: string }; const policy = active.sportPolicies.find((item) => item.clubId === club.id); const aligned = Number((policy?.phasePriorities as Record<string, number> | undefined)?.[recommendation.phase ?? ""] ?? 50) >= 55; const decision = meetingDecision({ choice, coach, aligned, seed: active.worldSeed });
  await prisma.$transaction(async (tx) => { await tx.directorSportMeeting.update({ where: { id: meeting.id }, data: { status: "RESOLVED", resolution: decision.outcome, response: { choice, ...decision }, resolvedDay: active.dayIndex, resolvedAt: new Date() } }); await tx.directorCoach.update({ where: { id: coach.id }, data: { relationship: clamp(coach.relationship + decision.relationshipDelta) } }); await tx.directorCausalLog.create({ data: { careerId: active.id, dayIndex: active.dayIndex, sourceType: "SPORT_MEETING", sourceId: meeting.id, category: "SPORT", headline: `Porada: ${decision.outcome.toLowerCase()}`, explanation: decision.explanation, targetType: "COACH", targetId: coach.id, importance: 2 } }); });
  return (await getDirectorWorld(user))!;
}

async function unlock(tx: Prisma.TransactionClient, careerId: string, item: { key: string; title: string; description: string; rarity: string }) {
  await tx.directorAchievement.upsert({ where: { careerId_key: { careerId, key: item.key } }, create: { careerId, ...item }, update: {} });
}

function toDTO(career: LoadedCareer, legacyArchiveAvailable: boolean): DirectorDTO {
  const club = career.clubs.find((item) => item.isManaged);
  if (!club) throw new Error("Kariéra nemá přiřazený klub.");
  const coach = club.coaches.find((item) => item.status === "ACTIVE") ?? null;
  const season = career.seasons[0] ?? null;
  const standings = season ? [...season.standings].sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor) : [];
  const pendingLedger = career.ledger.filter((item) => item.status === "PENDING");
  const managedRow = standings.find((item) => item.clubId === club.id);
  const playedMatches = Math.max(1, managedRow?.played ?? 0);
  const coachScore = coachEvaluation({ pointsPerMatch: (managedRow?.points ?? 0) / playedMatches, expectedPointsPerMatch: (managedRow?.expectedPoints ?? 0) / playedMatches, squadUtilization: club.players.filter((item) => item.appearances > 0).length / Math.max(1, club.players.length), youthMinuteShare: club.players.filter((item) => item.age <= 21).reduce((sum, item) => sum + item.minutes, 0) / Math.max(1, club.players.reduce((sum, item) => sum + item.minutes, 0)), morale: club.morale, philosophyFit: coach ? clamp((coach.adaptability + club.cohesion) / 2) : 0 });
  const windowState = transferWindow(career.dayIndex, season?.rules);
  return {
    career: { id: career.id, name: career.name, version: career.version, gameDate: career.gameDate.toISOString(), dayIndex: career.dayIndex, availableSteps: effectiveSteps(career), reputation: career.reputation, boardTrust: career.boardTrust, publicTrust: career.publicTrust, mediaCredibility: career.mediaCredibility, ethicsMode: career.ethicsMode, identityTags: asStringArray(career.identityTags) },
    club: { id: club.id, name: club.name, shortName: club.shortName, logo: club.logo, primaryColor: club.primaryColor, leagueName: career.leagueName, cashBalance: club.cashBalance, transferBudget: club.transferBudget, wageBudget: club.wageBudget, weeklyWages: club.weeklyWages, fanTrust: club.fanTrust, morale: club.morale, cohesion: club.cohesion, form: club.currentForm, stadium: { name: club.stadiumName, capacity: club.stadiumCapacity, attendance: club.stadiumAttendance, condition: club.stadiumCondition, atmosphere: club.stadiumAtmosphere, commercial: club.stadiumCommercial }, facilities: { academy: club.academyLevel, training: club.trainingLevel, medical: club.medicalLevel, scouting: club.scoutingLevel } },
    coach: coach ? { id: coach.id, name: coach.name, philosophy: coach.philosophy, formation: coach.formation, adaptability: coach.adaptability, youthDevelopment: coach.youthDevelopment, manManagement: coach.manManagement, matchManagement: coach.matchManagement, relationship: coach.relationship, transferAuthority: coach.transferAuthority, transferVeto: coach.transferVeto, contractUntil: coach.contractUntil.toISOString(), weeklyWage: coach.weeklyWage, personality: coach.personality, reputation: coach.reputation, ambition: coach.ambition, mandate: coach.mandate && typeof coach.mandate === "object" && !Array.isArray(coach.mandate) ? coach.mandate as Record<string, unknown> : {}, evaluation: coachScore } : null,
    players: club.players.sort((a, b) => b.ability - a.ability).map((item) => { const expectation = career.expectations.find((entry) => entry.playerId === item.id); const agent = career.agents.find((entry) => entry.id === item.agentId); const reason = expectation && Array.isArray(expectation.reasons) && typeof expectation.reasons[0] === "string" ? expectation.reasons[0] : null; const roles = roleScores(item); return { id: item.id, name: `${item.firstName} ${item.lastName}`, position: item.position, archetype: item.archetype, personality: item.personality, age: item.age, ability: item.ability, potential: item.potential, form: item.form, fitness: item.fitness, morale: item.morale, injuryDays: item.injuryDays, contractUntil: item.contractUntil.toISOString(), weeklyWage: item.weeklyWage, marketValue: item.marketValue, promisedRole: item.promisedRole, transferStatus: item.transferStatus, tacticalRoles: Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([role, fit]) => ({ role, fit })), load: { acute: item.acuteLoad, chronic: item.chronicLoad, readiness: item.matchReadiness, healthRisk: item.healthRisk, healthStatus: item.healthStatus, minutesLimit: item.minutesLimit, recurrenceRisk: item.recurrenceRisk }, expectation: expectation ? { expectedRole: expectation.expectedRole, targetMinuteShare: expectation.targetMinuteShare, actualMinuteShare: expectation.actualMinuteShare, status: expectation.status, escalationStage: expectation.escalationStage, willingness: expectation.willingness, reason } : null, agent: agent ? { name: agent.name, personality: agent.personality } : null }; }),
    events: career.events.map((item) => ({ id: item.id, category: item.category, severity: item.severity, title: item.title, body: item.body, reason: eventReason(item.category), stakes: eventStakes(item.category), dueDay: item.dueDay, choices: asChoices(item.choices) })),
    pulse: career.pulsePosts.map((item) => ({ id: item.id, authorType: item.authorType, authorName: item.authorName, tone: item.tone, body: item.body, topic: item.topic, trust: item.trust, reach: item.reach, dayIndex: item.dayIndex })),
    achievements: career.achievements.map((item) => ({ id: item.id, key: item.key, title: item.title, description: item.description, rarity: item.rarity as DirectorDTO["achievements"][number]["rarity"], unlockedAt: item.unlockedAt.toISOString(), seen: Boolean(item.seenAt) })),
    matches: career.matches.map((match) => {
      const home = career.clubs.find((item) => item.id === match.homeClubId)!;
      const away = career.clubs.find((item) => item.id === match.awayClubId)!;
      const plan = career.matchPlans.find((item) => item.matchId === match.id && item.clubId === club.id); const lineup = plan && Array.isArray(plan.lineup) ? plan.lineup as unknown as NonNullable<DirectorDTO["matches"][number]["plan"]>["lineup"] : [];
      return { id: match.id, round: match.round, scheduledDay: match.scheduledDay, status: match.status, homeName: home?.name ?? "Domácí", awayName: away?.name ?? "Hosté", homeLogo: home?.logo ?? null, awayLogo: away?.logo ?? null, homeGoals: match.homeGoals, awayGoals: match.awayGoals, homeXg: match.homeXg, awayXg: match.awayXg, engineVersion: match.engineVersion, phaseStats: match.phaseStats && typeof match.phaseStats === "object" && !Array.isArray(match.phaseStats) ? match.phaseStats as Record<string, unknown> : {}, plan: plan ? { formation: plan.formation, mentality: plan.mentality, confidence: plan.confidence, familiarity: plan.familiarity, predictability: plan.predictability, cohesionCost: plan.cohesionCost, uncertainty: asStringArray(plan.uncertainty), lineup, reasons: asStringArray(plan.selectionReasons), weaknesses: asStringArray(plan.weaknesses) } : null, timeline: Array.isArray(match.timeline) ? match.timeline as unknown as DirectorDTO["matches"][number]["timeline"] : [], coachReport: match.coachReport && typeof match.coachReport === "object" && !Array.isArray(match.coachReport) ? match.coachReport as DirectorDTO["matches"][number]["coachReport"] : {} };
    }),
    marketTargets: career.clubs.filter((item) => !item.isManaged).flatMap((item) => item.players.map((player) => ({ player, club: item }))).sort((a, b) => b.player.potential - a.player.potential).slice(0, 18).map(({ player, club: owner }) => {
      const report = career.scoutingReports.filter((item) => item.requestingClubId === club.id && item.playerId === player.id).sort((a, b) => b.dayIndex - a.dayIndex)[0];
      const fallback = scoutingSnapshot({ seed: career.worldSeed, day: career.dayIndex, playerId: player.id, ability: player.ability, potential: player.potential, value: player.marketValue, wage: player.weeklyWage, scoutingQuality: club.scoutingLevel * 12, tacticalFit: 55 });
      const view = report ?? fallback;
      return { id: player.id, name: `${player.firstName} ${player.lastName}`, club: owner.name, country: owner.country, competition: owner.competitionName, position: player.position, archetype: player.archetype, age: player.age, estimateMin: view.valueMin, estimateMax: view.valueMax, abilityMin: Math.round(view.abilityMin), abilityMax: Math.round(view.abilityMax), potentialMin: Math.round(view.potentialMin), potentialMax: Math.round(view.potentialMax), wageMin: view.wageMin, wageMax: view.wageMax, tacticalFit: view.tacticalFit, completeness: view.completeness, shortlisted: career.shortlistEntries.some((item) => item.clubId === club.id && item.playerId === player.id && item.status !== "REMOVED") };
    }),
    negotiations: career.negotiations.map((item) => {
      const seller = career.clubs.find((clubItem) => clubItem.id === item.sellingClubId);
      const target = seller?.players.find((player) => player.id === item.playerId);
      return { id: item.id, playerId: item.playerId, playerName: target ? `${target.firstName} ${target.lastName}` : "Hráč", clubName: seller?.name ?? "Klub", status: item.status, round: item.round, patience: item.patience, referenceValue: item.referenceValue, response: item.response };
    }),
    people: {
      transferWindow: { open: windowState.open, name: windowState.current?.name ?? null, nextDay: windowState.next?.start ?? null },
      staff: career.staff.filter((item) => item.clubId === club.id).map((item) => ({ id: item.id, role: item.role, name: item.name, ability: item.ability, workload: item.workload, weeklyWage: item.weeklyWage, relationship: item.relationship, status: item.status, uncertainty: informationQuality(career.staff.filter((staff) => staff.clubId === club.id), item.role as typeof STAFF_ROLES[number]).uncertainty })),
      staffCandidates: career.staff.filter((item) => item.clubId === null && item.status === "CANDIDATE").map((item) => ({ id: item.id, role: item.role, name: item.name, ability: item.ability, weeklyWage: item.weeklyWage, personality: item.personality })),
      squadGroups: career.squadGroups.filter((item) => item.clubId === club.id).map((item) => ({ id: item.id, kind: item.kind, name: item.name, influence: item.influence, members: asStringArray(item.memberIds).map((id) => { const player = club.players.find((candidate) => candidate.id === id); return player ? `${player.firstName} ${player.lastName}` : id; }) })),
      transferCases: career.transferCases.filter((item) => item.buyingClubId === club.id || item.sellingClubId === club.id).map((item) => { const player = career.clubs.flatMap((entry) => entry.players).find((entry) => entry.id === item.playerId); const seller = career.clubs.find((entry) => entry.id === item.sellingClubId); const buyer = career.clubs.find((entry) => entry.id === item.buyingClubId); const latest = item.offers.at(-1); return { id: item.id, playerId: item.playerId, playerName: player ? `${player.firstName} ${player.lastName}` : "Hráč", sellingClub: seller?.name ?? "Klub", buyingClub: buyer?.name ?? "Klub", kind: item.kind, status: item.status, stage: item.stage, initiatedBy: item.initiatedBy, deadlineDay: item.deadlineDay, registrationDay: item.registrationDay, response: latest?.response ?? null, round: latest?.round ?? 0, competingBids: career.competingBids.filter((bid) => bid.caseId === item.id && bid.status === "ACTIVE").length, failureReason: item.failureReason }; }),
      contractTalks: career.contractTalks.filter((item) => item.clubId === club.id).map((item) => { const player = career.clubs.flatMap((entry) => entry.players).find((entry) => entry.id === item.playerId); const latest = item.offers.at(-1); return { id: item.id, caseId: item.caseId, playerName: player ? `${player.firstName} ${player.lastName}` : "Hráč", status: item.status, round: item.round, patience: item.patience, deadlineDay: item.deadlineDay, response: latest?.response ?? null }; }),
      objectives: career.objectives.filter((item) => item.clubId === club.id && (!season || item.seasonId === season.id)).map((item) => ({ id: item.id, kind: item.kind, target: item.target, progress: item.progress, status: item.status, explanation: item.explanation })),
      reviews: career.boardReviews.filter((item) => item.clubId === club.id).map((item) => ({ id: item.id, kind: item.kind, overall: item.overall, outcome: item.outcome, dayIndex: item.dayIndex, explanation: asStringArray(item.explanation) })),
      coachCandidates: career.coachCandidates.map((item) => ({ id: item.id, name: item.name, philosophy: item.philosophy, reputation: item.reputation, ambition: item.ambition, wageDemand: item.wageDemand, status: item.status })),
      coachNegotiations: career.coachNegotiations.map((item) => ({ id: item.id, candidateName: career.coachCandidates.find((candidate) => candidate.id === item.candidateId)?.name ?? "Kandidát", status: item.status, round: item.round, patience: item.patience, response: item.response })),
      jobOffers: career.jobOffers.map((item) => ({ id: item.id, clubName: career.clubs.find((clubItem) => clubItem.id === item.clubId)?.name ?? "Klub", status: item.status, expiresDay: item.expiresDay })),
    },
    sporting: (() => {
      const policy = career.sportPolicies.find((entry) => entry.clubId === club.id);
      const memory = career.coachMemories.find((entry) => entry.clubId === club.id && entry.coachId === coach?.id);
      const cycle = career.trainingCycles.find((entry) => entry.clubId === club.id);
      const nextMatch = career.matches.find((match) => match.status === "SCHEDULED" && (match.homeClubId === club.id || match.awayClubId === club.id));
      const analysis = nextMatch ? career.opponentAnalyses.find((entry) => entry.matchId === nextMatch.id && entry.clubId === club.id) : undefined;
      const opponent = career.clubs.find((entry) => entry.id === analysis?.opponentClubId);
      const medicalAlerts = career.medicalReports.filter((entry) => entry.clubId === club.id && entry.dayIndex === career.dayIndex && entry.status !== "FIT").map((entry) => { const player = club.players.find((item) => item.id === entry.playerId); return { playerId: entry.playerId, playerName: player ? `${player.firstName} ${player.lastName}` : "Hráč", status: entry.status, readiness: entry.readiness, recurrenceRisk: entry.recurrenceRisk, minutesLimit: entry.minutesLimit, returnWindow: entry.estimatedMinDay !== null && entry.estimatedMaxDay !== null ? `${entry.estimatedMinDay}.–${entry.estimatedMaxDay}. den` : null, explanation: entry.explanation }; });
      return { policy: policy ? { desiredStyle: policy.desiredStyle, youthPreference: policy.youthPreference, rotationLevel: policy.rotationLevel, trainingIntensity: policy.trainingIntensity, healthRiskTolerance: policy.healthRiskTolerance, phasePriorities: policy.phasePriorities as Record<string, number> } : null, meetings: career.sportMeetings.filter((item) => item.clubId === club.id).map((item) => ({ id: item.id, title: item.title, briefing: item.briefing, trigger: item.trigger, status: item.status, dueDay: item.dueDay, recommendation: item.recommendation as Record<string, unknown>, resolution: item.resolution })), memory: memory ? { phases: memory.phaseAssessment as Record<string, number>, familiarity: memory.systemFamiliarity, predictability: memory.predictability, confidence: memory.confidence, sampleSize: Array.isArray(memory.recentPlans) ? memory.recentPlans.length : 0 } : null, microcycle: cycle ? { kind: cycle.kind, intensity: cycle.intensity, focus: cycle.focus, congestion: cycle.congestion, explanation: cycle.explanation } : null, medicalAlerts, opponentAnalysis: analysis ? { opponentName: opponent?.name ?? "Soupeř", sampleSize: analysis.sampleSize, predictability: analysis.predictability, uncertainty: analysis.uncertainty, keyDuels: asStringArray(analysis.keyDuels), explanation: asStringArray(analysis.explanation) } : null };
    })(),
    projects: career.projects.map((item) => ({ id: item.id, kind: item.kind, title: item.title, status: item.status, startedDay: item.startedDay, finishDay: item.finishDay, cost: item.cost })),
    influences: career.effects.filter((item) => item.status === "ACTIVE").map((item) => { const value = effectValue({ ...item, decay: item.decay as "NONE" | "LINEAR" | "EXPONENTIAL" }, career.dayIndex); return { id: item.id, sourceLabel: item.sourceLabel, metric: item.metric, direction: item.direction, strength: Math.abs(value) < .5 ? "slabý" : Math.abs(value) < 1.5 ? "mírný" : Math.abs(value) < 3 ? "výrazný" : "silný", confidence: item.confidence >= .8 ? "vysoká" : item.confidence >= .55 ? "střední" : "nízká", explanation: item.explanation, startDay: item.startDay, endDay: item.endDay }; }),
    commitments: career.commitments.map((item) => ({ id: item.id, stakeholderType: item.stakeholderType, title: item.title, status: item.status, dueDay: item.dueDay, progress: item.progress, explanation: item.explanation })),
    relationships: career.relationships.map((item) => { const drivers = describeDrivers([{ label: "vzájemná důvěra", value: item.trust - 50 }, { label: "respekt", value: item.respect - 50 }, { label: "soulad priorit", value: item.alignment - 50 }, { label: "nahromaděné konflikty", value: -item.conflicts }]); return { id: item.id, actorType: item.actorType, actorName: item.actorName, trust: item.trust, respect: item.respect, alignment: item.alignment, conflicts: item.conflicts, summary: drivers.length ? drivers.map((driver) => `${driver.strength} ${driver.direction === "POSITIVE" ? "pozitivní" : "negativní"}: ${driver.label}`).join(" · ") : "Vztah je zatím neutrální." }; }),
    changes: career.causalLogs.map((item) => ({ id: item.id, dayIndex: item.dayIndex, category: item.category, headline: item.headline, explanation: item.explanation, importance: item.importance, sourceType: item.sourceType, sourceId: item.sourceId })),
    finances: { receivables: pendingLedger.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.amount, 0) + career.transferPayments.filter((item) => item.status === "PENDING" && item.payeeClubId === club.id).reduce((sum, item) => sum + item.amount, 0), liabilities: pendingLedger.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.amount, 0) + career.transferPayments.filter((item) => item.status === "PENDING" && item.payerClubId === club.id).reduce((sum, item) => sum + item.amount, 0), recent: career.ledger.slice(0, 20).map((item) => ({ id: item.id, dayIndex: item.dayIndex, category: item.category, direction: item.direction, amount: item.amount, status: item.status, description: item.description })) },
    market: (() => {
      const pending = career.transferPayments.filter((item) => item.status === "PENDING" && (item.payerClubId === club.id || item.payeeClubId === club.id));
      const outgoing = pending.filter((item) => item.payerClubId === club.id).map((item) => item.amount);
      const incoming = pending.filter((item) => item.payeeClubId === club.id).map((item) => item.amount);
      const projection = cashFlowProjection({ cash: club.cashBalance, reservedCash: club.reservedCash, weeklyWages: club.weeklyWages, wageBudget: club.wageBudget, upfront: 0, signingBonus: 0, agentFee: 0, futurePayments: outgoing, incoming });
      return { needs: career.needs.filter((item) => item.clubId === club.id && item.status === "OPEN").map((item) => ({ id: item.id, position: item.target, role: item.desiredRole, urgency: item.urgency, reason: item.reason, budgetMin: item.budgetMin, budgetMax: item.budgetMax, tacticalFit: item.tacticalFit })), shortlist: career.shortlistEntries.filter((item) => item.clubId === club.id && item.status !== "REMOVED").map((item) => { const player = career.clubs.flatMap((entry) => entry.players).find((entry) => entry.id === item.playerId); return { playerId: item.playerId, playerName: player ? `${player.firstName} ${player.lastName}` : "Hráč", priority: item.priority, status: item.status, note: item.note, alert: item.lastAlert }; }), payments: pending.map((item) => ({ id: item.id, kind: item.kind, amount: item.amount, dueDay: item.dueDay, status: item.status, direction: item.payerClubId === club.id ? "OUT" : "IN" })), clauses: career.transferClauses.filter((item) => item.status === "ACTIVE" && item.beneficiaryClubId === club.id).map((item) => ({ id: item.id, playerId: item.playerId, kind: item.kind, value: item.value, status: item.status })), reservedCash: club.reservedCash, worstProjectedCash: projection.worst };
    })(),
    season: season ? { number: season.number, currentRound: season.currentRound, status: season.status, table: standings.map((row, index) => { const team = career.clubs.find((item) => item.id === row.clubId)!; return { position: index + 1, clubId: row.clubId, clubName: team?.name ?? "Klub", logo: team?.logo ?? null, played: row.played, wins: row.wins, draws: row.draws, losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, points: row.points, expectedPoints: row.expectedPoints, performance: row.performance, isManaged: Boolean(team?.isManaged) }; }) } : null,
    legacyArchiveAvailable,
  };
}

export function isDirectorLeagueAllowed(leagueId: number) {
  return Boolean(leagueMeta(leagueId));
}

export function summarizeTeam(team: GameTeam) {
  return { id: team.id, name: team.name, short: team.short, logo: team.logo ?? null, color: team.color };
}

function averagePosition(players: Array<{ position: string; ability: number; injuryDays: number }>, target: string) {
  const aliases: Record<string, string[]> = { GK: ["GK"], CB: ["CB", "LB", "RB", "FB"], CM: ["DM", "CM", "AM"], ST: ["LW", "RW", "W", "ST"] };
  const pool = players.filter((item) => (aliases[target] ?? [target]).includes(item.position) && item.injuryDays <= 0).sort((a, b) => b.ability - a.ability).slice(0, target === "GK" ? 1 : 3);
  return pool.length ? pool.reduce((sum, item) => sum + item.ability, 0) / pool.length : 25;
}

function eventReason(category: string) {
  return ({ COACH: "Požadavek vznikl z potřeb trenéra a souladu kádru s jeho filozofií.", SQUAD: "Situaci vyvolala role hráče, jeho vytížení a stav kabiny.", FANS: "Téma otevřela návštěvnost, cenová politika a důvěra fanoušků.", STADIUM: "Podnět vznikl ze stavu areálu, dostupné hotovosti a dlouhodobých potřeb klubu.", MEDIA: "Veřejný tlak reaguje na předchozí výroky a rozhodnutí vedení.", ETHICS: "Příležitost vznikla z finančního nebo zákulisního tlaku a zanechá reputační stopu.", BOARD: "Rada reaguje na finance, výsledky a dříve schválené cíle." } as Record<string, string>)[category] ?? "Situace vychází z aktuálního stavu klubového světa.";
}

function eventStakes(category: string) {
  return ({ COACH: "V sázce je důvěra trenéra a konzistence sportovního plánu.", SQUAD: "V sázce je morálka, role hráče a stabilita kabiny.", FANS: "V sázce je vztah s tribunou, návštěvnost a příjmy.", STADIUM: "V sázce jsou finance, termín projektu a budoucí kapacita klubu.", MEDIA: "V sázce je důvěryhodnost a tón budoucího zpravodajství.", ETHICS: "V sázce jsou finance, reputace a riziko pozdějšího odhalení.", BOARD: "V sázce je mandát vedení a finanční prostor." } as Record<string, string>)[category] ?? "Rozhodnutí může mít krátkodobé i dlouhodobé následky.";
}
