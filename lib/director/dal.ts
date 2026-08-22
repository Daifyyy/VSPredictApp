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

async function upgradeCausalWorld(tx: Prisma.TransactionClient, career: LoadedCareer) {
  if (career.version >= DIRECTOR_WORLD_VERSION && career.seasons.length) return;
  const schedule = roundRobinSchedule(career.clubs.map((item) => item.id));
  await tx.directorMatch.deleteMany({ where: { careerId: career.id, status: "SCHEDULED" } });
  await tx.directorMatch.createMany({ data: schedule.map((match) => ({ careerId: career.id, ...match })), skipDuplicates: true });
  let season = career.seasons[0];
  if (!season) season = await tx.directorSeason.create({ data: { careerId: career.id, number: 1, endDay: Math.max(...schedule.map((item) => item.scheduledDay)) + 7, rules: { pointsWin: 3, pointsDraw: 1 } }, include: { standings: true } });
  await tx.directorStanding.createMany({ data: career.clubs.map((club) => ({ seasonId: season.id, clubId: club.id })), skipDuplicates: true });
  const managed = career.clubs.find((item) => item.isManaged)!;
  await tx.directorRelationship.createMany({ data: [
    { careerId: career.id, actorType: "BOARD", actorName: "Klubová rada", trust: career.boardTrust, respect: 58, alignment: 55, priorities: { finance: .7, results: .65 } },
    { careerId: career.id, actorType: "COACH", actorId: managed.coaches[0]?.id, actorName: managed.coaches[0]?.name ?? "Hlavní trenér", trust: managed.coaches[0]?.relationship ?? 65, respect: 62, alignment: 58, priorities: { squad: .8, authority: .6 } },
    { careerId: career.id, actorType: "SUPPORTERS", actorName: "Rada fanoušků", trust: managed.fanTrust, respect: 55, alignment: 52, priorities: { identity: .8, prices: .7 } },
    { careerId: career.id, actorType: "MEDIA", actorName: "Kluboví novináři", trust: career.mediaCredibility, respect: 52, alignment: 45, priorities: { transparency: .8 } },
  ], skipDuplicates: true });
  await tx.directorCausalLog.create({ data: { careerId: career.id, dayIndex: career.dayIndex, sourceType: "MIGRATION", category: "WORLD", headline: "Svět přešel na kauzální model", explanation: "Dosavadní výsledky zůstaly zachované. Nové vlivy, závazky a finance se sledují od tohoto dne.", importance: 3 } });
  await tx.directorCareer.update({ where: { id: career.id }, data: { version: DIRECTOR_WORLD_VERSION } });
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
  if (career.version < DIRECTOR_WORLD_VERSION || !career.seasons.length) {
    await prisma.$transaction((tx) => upgradeCausalWorld(tx, career!), { timeout: 30_000 });
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
        version: DIRECTOR_WORLD_VERSION, leagueId: input.leagueId, leagueName: meta.name,
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

  const created = await prisma.directorCareer.findUniqueOrThrow({ where: { id: createdId }, include: CAREER_INCLUDE });
  const legacy = await prisma.gameSave.findUnique({ where: { email: ownerKey(input.user) }, select: { email: true } });
  return toDTO(created, Boolean(legacy));
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
  const active = await loadActive(user);
  if (!active) throw new Error("Aktivní kariéra nebyla nalezena.");
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
        await tx.directorClub.update({ where: { id: item.id }, data: { cashBalance: item.cashBalance - item.weeklyWages } });
        await tx.directorLedgerEntry.create({ data: { careerId: active.id, clubId: item.id, dayIndex: nextDay, category: "WAGES", direction: "OUT", amount: item.weeklyWages, sourceType: "PAYROLL", description: "Týdenní mzdy hráčů a sportovního úseku" } });
      }
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
        await tx.directorClubNeed.upsert({ where: { careerId_clubId_kind_target: { careerId: active.id, clubId: item.id, kind: "SQUAD_POSITION", target } }, create: { careerId: active.id, clubId: item.id, kind: "SQUAD_POSITION", target, urgency, reason: `Kvalita a dostupnost pozice ${target} zaostává za zbytkem kádru.`, lastEvaluatedDay: nextDay }, update: { urgency, reason: `Kvalita a dostupnost pozice ${target} zaostává za zbytkem kádru.`, lastEvaluatedDay: nextDay, status: "OPEN" } });
      }
    }

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
        const played = simulateDirectorMatch({ seed: active.worldSeed, day: nextDay, round: dueMatch.round, home, away });
        await tx.directorMatch.update({ where: { id: dueMatch.id }, data: { status: "PLAYED", homeGoals: played.homeGoals, awayGoals: played.awayGoals, homeXg: played.homeXg, awayXg: played.awayXg, homeStrength: played.homeStrength, awayStrength: played.awayStrength, timeline: played.timeline, coachReport: played.coachReport, playedAt: now } });
        await tx.directorPlayer.updateMany({ where: { id: { in: [...played.homeLineupIds, ...played.awayLineupIds] } }, data: { appearances: { increment: 1 }, minutes: { increment: 90 }, fitness: { decrement: 7 } } });
        for (const [team, lineupIds] of [[home, played.homeLineupIds], [away, played.awayLineupIds]] as const) {
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
    const rows = tableRows(clubs, allMatches);
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

async function unlock(tx: Prisma.TransactionClient, careerId: string, item: { key: string; title: string; description: string; rarity: string }) {
  await tx.directorAchievement.upsert({ where: { careerId_key: { careerId, key: item.key } }, create: { careerId, ...item }, update: {} });
}

function toDTO(career: LoadedCareer, legacyArchiveAvailable: boolean): DirectorDTO {
  const club = career.clubs.find((item) => item.isManaged);
  if (!club) throw new Error("Kariéra nemá přiřazený klub.");
  const coach = club.coaches[0] ?? null;
  const season = career.seasons[0] ?? null;
  const standings = season ? [...season.standings].sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor) : [];
  const pendingLedger = career.ledger.filter((item) => item.status === "PENDING");
  return {
    career: { id: career.id, name: career.name, version: career.version, gameDate: career.gameDate.toISOString(), dayIndex: career.dayIndex, availableSteps: effectiveSteps(career), reputation: career.reputation, boardTrust: career.boardTrust, publicTrust: career.publicTrust, mediaCredibility: career.mediaCredibility, ethicsMode: career.ethicsMode, identityTags: asStringArray(career.identityTags) },
    club: { id: club.id, name: club.name, shortName: club.shortName, logo: club.logo, primaryColor: club.primaryColor, leagueName: career.leagueName, cashBalance: club.cashBalance, transferBudget: club.transferBudget, wageBudget: club.wageBudget, weeklyWages: club.weeklyWages, fanTrust: club.fanTrust, morale: club.morale, cohesion: club.cohesion, form: club.currentForm, stadium: { name: club.stadiumName, capacity: club.stadiumCapacity, attendance: club.stadiumAttendance, condition: club.stadiumCondition, atmosphere: club.stadiumAtmosphere, commercial: club.stadiumCommercial }, facilities: { academy: club.academyLevel, training: club.trainingLevel, medical: club.medicalLevel, scouting: club.scoutingLevel } },
    coach: coach ? { id: coach.id, name: coach.name, philosophy: coach.philosophy, formation: coach.formation, adaptability: coach.adaptability, youthDevelopment: coach.youthDevelopment, manManagement: coach.manManagement, matchManagement: coach.matchManagement, relationship: coach.relationship, transferAuthority: coach.transferAuthority, transferVeto: coach.transferVeto, contractUntil: coach.contractUntil.toISOString(), weeklyWage: coach.weeklyWage } : null,
    players: club.players.sort((a, b) => b.ability - a.ability).map((item) => ({ id: item.id, name: `${item.firstName} ${item.lastName}`, position: item.position, archetype: item.archetype, personality: item.personality, age: item.age, ability: item.ability, potential: item.potential, form: item.form, fitness: item.fitness, morale: item.morale, injuryDays: item.injuryDays, contractUntil: item.contractUntil.toISOString(), weeklyWage: item.weeklyWage, marketValue: item.marketValue, promisedRole: item.promisedRole })),
    events: career.events.map((item) => ({ id: item.id, category: item.category, severity: item.severity, title: item.title, body: item.body, reason: eventReason(item.category), stakes: eventStakes(item.category), dueDay: item.dueDay, choices: asChoices(item.choices) })),
    pulse: career.pulsePosts.map((item) => ({ id: item.id, authorType: item.authorType, authorName: item.authorName, tone: item.tone, body: item.body, topic: item.topic, trust: item.trust, reach: item.reach, dayIndex: item.dayIndex })),
    achievements: career.achievements.map((item) => ({ id: item.id, key: item.key, title: item.title, description: item.description, rarity: item.rarity as DirectorDTO["achievements"][number]["rarity"], unlockedAt: item.unlockedAt.toISOString(), seen: Boolean(item.seenAt) })),
    matches: career.matches.map((match) => {
      const home = career.clubs.find((item) => item.id === match.homeClubId)!;
      const away = career.clubs.find((item) => item.id === match.awayClubId)!;
      return { id: match.id, round: match.round, scheduledDay: match.scheduledDay, status: match.status, homeName: home?.name ?? "Domácí", awayName: away?.name ?? "Hosté", homeLogo: home?.logo ?? null, awayLogo: away?.logo ?? null, homeGoals: match.homeGoals, awayGoals: match.awayGoals, homeXg: match.homeXg, awayXg: match.awayXg, timeline: Array.isArray(match.timeline) ? match.timeline as unknown as DirectorDTO["matches"][number]["timeline"] : [], coachReport: match.coachReport && typeof match.coachReport === "object" && !Array.isArray(match.coachReport) ? match.coachReport as DirectorDTO["matches"][number]["coachReport"] : {} };
    }),
    marketTargets: career.clubs.filter((item) => !item.isManaged).flatMap((item) => item.players.map((player) => ({ player, club: item }))).sort((a, b) => b.player.potential - a.player.potential).slice(0, 12).map(({ player, club: owner }) => {
      const uncertainty = Math.max(3, 12 - club.scoutingLevel * 1.5);
      return { id: player.id, name: `${player.firstName} ${player.lastName}`, club: owner.name, position: player.position, archetype: player.archetype, age: player.age, estimateMin: Math.round(player.marketValue * .82), estimateMax: Math.round(player.marketValue * 1.24), abilityMin: Math.max(20, Math.round(player.ability - uncertainty)), abilityMax: Math.min(99, Math.round(player.ability + uncertainty)) };
    }),
    negotiations: career.negotiations.map((item) => {
      const seller = career.clubs.find((clubItem) => clubItem.id === item.sellingClubId);
      const target = seller?.players.find((player) => player.id === item.playerId);
      return { id: item.id, playerId: item.playerId, playerName: target ? `${target.firstName} ${target.lastName}` : "Hráč", clubName: seller?.name ?? "Klub", status: item.status, round: item.round, patience: item.patience, referenceValue: item.referenceValue, response: item.response };
    }),
    projects: career.projects.map((item) => ({ id: item.id, kind: item.kind, title: item.title, status: item.status, startedDay: item.startedDay, finishDay: item.finishDay, cost: item.cost })),
    influences: career.effects.filter((item) => item.status === "ACTIVE").map((item) => { const value = effectValue({ ...item, decay: item.decay as "NONE" | "LINEAR" | "EXPONENTIAL" }, career.dayIndex); return { id: item.id, sourceLabel: item.sourceLabel, metric: item.metric, direction: item.direction, strength: Math.abs(value) < .5 ? "slabý" : Math.abs(value) < 1.5 ? "mírný" : Math.abs(value) < 3 ? "výrazný" : "silný", confidence: item.confidence >= .8 ? "vysoká" : item.confidence >= .55 ? "střední" : "nízká", explanation: item.explanation, startDay: item.startDay, endDay: item.endDay }; }),
    commitments: career.commitments.map((item) => ({ id: item.id, stakeholderType: item.stakeholderType, title: item.title, status: item.status, dueDay: item.dueDay, progress: item.progress, explanation: item.explanation })),
    relationships: career.relationships.map((item) => { const drivers = describeDrivers([{ label: "vzájemná důvěra", value: item.trust - 50 }, { label: "respekt", value: item.respect - 50 }, { label: "soulad priorit", value: item.alignment - 50 }, { label: "nahromaděné konflikty", value: -item.conflicts }]); return { id: item.id, actorType: item.actorType, actorName: item.actorName, trust: item.trust, respect: item.respect, alignment: item.alignment, conflicts: item.conflicts, summary: drivers.length ? drivers.map((driver) => `${driver.strength} ${driver.direction === "POSITIVE" ? "pozitivní" : "negativní"}: ${driver.label}`).join(" · ") : "Vztah je zatím neutrální." }; }),
    changes: career.causalLogs.map((item) => ({ id: item.id, dayIndex: item.dayIndex, category: item.category, headline: item.headline, explanation: item.explanation, importance: item.importance, sourceType: item.sourceType, sourceId: item.sourceId })),
    finances: { receivables: pendingLedger.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.amount, 0), liabilities: pendingLedger.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.amount, 0), recent: career.ledger.slice(0, 20).map((item) => ({ id: item.id, dayIndex: item.dayIndex, category: item.category, direction: item.direction, amount: item.amount, status: item.status, description: item.description })) },
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
