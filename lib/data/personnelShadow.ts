import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  fetchFixtureInjuries,
  fetchFixtureLineups,
  fetchFixturePlayers,
  fetchTeamSeasonPlayers,
  fetchFixturesByIds,
  fetchLeagueCoverage,
  type ApiFixtureLineup,
  type ApiFixturePlayers,
} from "./apiFootball";
import { CURRENT_SEASON, PUBLIC_CLUB_LEAGUE_IDS } from "./catalog";
import { MODEL_VERSION } from "./modelVersion";
import { resolveIncident, upsertIncident } from "@/lib/operations";
import { playerPersonnelValue, weightedUnitStrength } from "@/lib/stats/personnelStrength";

export const PERSONNEL_FEATURE_VERSION = 1;
export const LINEUP_SHADOW_VERSION = 1;
// StarĹˇĂ­ utkĂˇnĂ­ nemohla mĂ­t prospektivnÄ› zachycenou sestavu a nesmÄ›jĂ­ sniĹľovat coverage.
export const PERSONNEL_COLLECTION_STARTED_AT = new Date("2026-09-10T00:00:00.000Z");
const PUBLIC_IDS = new Set<number>(PUBLIC_CLUB_LEAGUE_IDS);
const json = (value: unknown) => value as Prisma.InputJsonValue;
const minuteBucket = (date: Date) => new Date(Math.floor(date.getTime() / 60_000) * 60_000);
const numberOf = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const result = Number(String(value).replace("%", ""));
  return Number.isFinite(result) ? result : null;
};

type FetchAudit = { dataType: string; endpoint: string; fixtureId?: number; leagueId?: number; teamId?: number; season?: number };
async function auditedFetch<T>(meta: FetchAudit, operation: () => Promise<T>, count: (value: T) => number) {
  const started = Date.now();
  const attemptedAt = minuteBucket(new Date());
  const attemptKey = [meta.dataType, meta.fixtureId ?? "-", meta.leagueId ?? "-", meta.teamId ?? "-", meta.season ?? "-", attemptedAt.toISOString()].join(":");
  try {
    const value = await operation();
    const rowCount = count(value);
    await prisma.personnelFetchAttempt.upsert({ where: { attemptKey }, update: {}, create: {
      attemptKey, ...meta, status: rowCount > 0 ? "SUCCESS_WITH_DATA" : "SUCCESS_EMPTY",
      rowCount, durationMs: Date.now() - started, attemptedAt,
    } });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.personnelFetchAttempt.upsert({ where: { attemptKey }, update: {}, create: {
      attemptKey, ...meta, status: "FETCH_FAILED", durationMs: Date.now() - started,
      errorCode: /HTTP (\d+)/.exec(message)?.[1] ?? null, errorMessage: message.slice(0, 500), attemptedAt,
    } }).catch(() => {});
    throw error;
  }
}

export function availabilityType(type: string | null | undefined, reason: string | null | undefined) {
  const text = `${type ?? ""} ${reason ?? ""}`.toLowerCase();
  if (/suspend|ban|disciplin/.test(text)) return "SUSPENSION";
  if (/doubt|question|uncertain/.test(text)) return "DOUBTFUL";
  if (/injur|strain|fracture|muscle|knee|ankle|illness/.test(text)) return "INJURY";
  return "OTHER";
}

export function lineupCompleteness(lineup: ApiFixtureLineup): number {
  const starters = lineup.startXI.length;
  const bench = lineup.substitutes.length;
  return Math.min(1, (Math.min(11, starters) / 11) * .8 + (bench ? .1 : 0) + (lineup.formation ? .05 : 0) + (lineup.coach?.name ? .05 : 0));
}

export async function saveLineup(fixtureId: number, kickoff: Date, lineup: ApiFixtureLineup, at: Date) {
  const starters = lineup.startXI;
  const substitutes = lineup.substitutes;
  const status = starters.length === 11 ? "CONFIRMED" : "EXPECTED";
  const starterIds = starters.map((row) => row.player.id).filter((id): id is number => id != null);
  const substituteIds = substitutes.map((row) => row.player.id).filter((id): id is number => id != null);
  const duplicate = starterIds.length !== new Set(starterIds).size || substituteIds.length !== new Set(substituteIds).size || starterIds.some((id) => substituteIds.includes(id));
  const unreasonable = starters.length > 11 || starters.length < 7;
  if (duplicate || unreasonable) {
    await upsertIncident({
      fingerprint: `personnel:lineup-invalid:${fixtureId}:${lineup.team.id}`,
      kind: "PERSONNEL_DATA", severity: "WARNING",
      message: `Sestava fixture ${fixtureId} obsahuje duplicitu nebo nerozumný počet hráčů.`,
      details: { fixtureId, teamId: lineup.team.id, starters: starters.length, substitutes: substitutes.length, duplicate },
    });
    return null;
  }
  await resolveIncident(`personnel:lineup-invalid:${fixtureId}:${lineup.team.id}`);
  const previous = await prisma.fixtureLineupSnapshot.findFirst({
    where: { fixtureId, teamId: lineup.team.id }, orderBy: { capturedAt: "desc" }, include: { players: true },
  });
  const signature = (rows: Array<{ playerId: number | null; role: string }>) => rows.map((row) => `${row.role}:${row.playerId ?? "?"}`).sort().join("|");
  const incoming = [
    ...starters.map((row) => ({ playerId: row.player.id ?? null, role: "STARTER" })),
    ...substitutes.map((row) => ({ playerId: row.player.id ?? null, role: "SUBSTITUTE" })),
  ];
  if (previous && previous.status === status && previous.formation === (lineup.formation?.trim() || null) && signature(previous.players) === signature(incoming)) return previous;
  return prisma.fixtureLineupSnapshot.create({
    data: {
      fixtureId, kickoff, teamId: lineup.team.id, status, formation: lineup.formation?.trim() || null,
      coachId: lineup.coach?.id ?? null, coachName: lineup.coach?.name?.trim() || null,
      publishedAt: at, capturedAt: minuteBucket(at), completeness: lineupCompleteness(lineup),
      players: { create: [
        ...starters.map((row, index) => ({ playerId: row.player.id ?? null, playerName: row.player.name, role: "STARTER", position: row.player.pos ?? null, shirtNumber: row.player.number ?? null, sourceOrder: index })),
        ...substitutes.map((row, index) => ({ playerId: row.player.id ?? null, playerName: row.player.name, role: "SUBSTITUTE", position: row.player.pos ?? null, shirtNumber: row.player.number ?? null, sourceOrder: index })),
      ] },
    }, include: { players: true },
  });
}

async function saveAvailability(fixture: { fixtureId: number; kickoff: Date; homeTeamId: number; awayTeamId: number }, at: Date) {
  const rows = await auditedFetch({ dataType: "AVAILABILITY", endpoint: "/injuries", fixtureId: fixture.fixtureId }, () => fetchFixtureInjuries(fixture.fixtureId), (value) => value.length);
  for (const row of rows) {
    const teamId = row.team?.id;
    if (!teamId || (teamId !== fixture.homeTeamId && teamId !== fixture.awayTeamId)) continue;
    await prisma.fixtureAvailabilitySnapshot.upsert({
      where: { fixtureId_teamId_playerName_availabilityType_capturedAt: {
        fixtureId: fixture.fixtureId, teamId, playerName: row.player.name,
        availabilityType: availabilityType(row.type, row.reason), capturedAt: minuteBucket(at),
      } }, update: {}, create: {
        fixtureId: fixture.fixtureId, kickoff: fixture.kickoff, teamId, playerId: row.player.id,
        playerName: row.player.name, availabilityType: availabilityType(row.type, row.reason),
        reason: row.reason ?? row.type ?? null, status: "UNAVAILABLE", sourceKind: "FIXTURE", capturedAt: minuteBucket(at),
      },
    });
  }
  await prisma.apiCache.upsert({
    where: { key: `personnel:availability:${fixture.fixtureId}` },
    update: { payload: json({ count: rows.length }), expiresAt: new Date(at.getTime() + 13 * 60 * 60_000) },
    create: { key: `personnel:availability:${fixture.fixtureId}`, payload: json({ count: rows.length }), expiresAt: new Date(at.getTime() + 13 * 60 * 60_000) },
  });
  return rows.length;
}

function flattenedPlayers(raw: ApiFixturePlayers) {
  return raw.flatMap((team) => team.players.flatMap((entry) => {
    const stat = entry.statistics[0];
    if (!stat) return [];
    const values = {
      fixtureId: 0, playerId: entry.player.id, playerName: entry.player.name, teamId: team.team.id,
      starter: stat.games?.substitute == null ? null : !stat.games.substitute,
      position: stat.games?.position ?? null, minutes: numberOf(stat.games?.minutes), rating: numberOf(stat.games?.rating),
      goals: numberOf(stat.goals?.total), assists: numberOf(stat.goals?.assists), shots: numberOf(stat.shots?.total),
      shotsOnTarget: numberOf(stat.shots?.on), passes: numberOf(stat.passes?.total), keyPasses: numberOf(stat.passes?.key),
      tackles: numberOf(stat.tackles?.total), interceptions: numberOf(stat.tackles?.interceptions), duels: numberOf(stat.duels?.total),
      duelsWon: numberOf(stat.duels?.won), yellowCards: numberOf(stat.cards?.yellow), redCards: numberOf(stat.cards?.red),
      saves: numberOf(stat.goals?.saves), conceded: numberOf(stat.goals?.conceded), metrics: stat,
    };
    const populated = Object.entries(values).filter(([key, value]) => !["fixtureId", "playerId", "playerName", "teamId", "metrics"].includes(key) && value != null).length;
    return [{ ...values, completeness: Math.min(1, populated / 16) }];
  }));
}

async function savePlayerMatch(fixtureId: number, raw: ApiFixturePlayers, capturedAt: Date) {
  const players = flattenedPlayers(raw);
  for (const row of players) await prisma.playerMatchSnapshot.upsert({
    where: { fixtureId_playerId: { fixtureId, playerId: row.playerId } }, update: {},
    create: { ...row, fixtureId, metrics: json(row.metrics), capturedAt },
  });
  return players.length;
}

function sumKnown(rows: Array<Record<string, unknown>>, key: string) {
  const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

async function refreshPlayerSeasonProfiles(fixtureId: number, capturedAt: Date) {
  const fixture = await prisma.fixturePrediction.findUnique({
    where: { fixtureId }, select: { leagueId: true, season: true, homeTeamId: true, awayTeamId: true },
  });
  if (!fixture) return 0;
  let saved = 0;
  for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
    const fixtures = await prisma.fixturePrediction.findMany({
      where: { leagueId: fixture.leagueId, season: fixture.season, kickoff: { lte: capturedAt }, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      select: { fixtureId: true },
    });
    const rows = await prisma.playerMatchSnapshot.findMany({ where: { teamId, fixtureId: { in: fixtures.map((row) => row.fixtureId) } } });
    const byPlayer = new Map<number, typeof rows>();
    for (const row of rows) byPlayer.set(row.playerId, [...(byPlayer.get(row.playerId) ?? []), row]);
    const bucket = new Date(Date.UTC(capturedAt.getUTCFullYear(), capturedAt.getUTCMonth(), capturedAt.getUTCDate()));
    for (const playerRows of byPlayer.values()) {
      const latest = playerRows.toSorted((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0];
      const ratings = playerRows.map((row) => row.rating).filter((value): value is number => value != null);
      const metrics = { matchFixtures: playerRows.map((row) => row.fixtureId), source: "prospective-match-snapshots" };
      await prisma.playerSeasonSnapshot.upsert({
        where: { playerId_teamId_leagueId_season_capturedAt: { playerId: latest.playerId, teamId, leagueId: fixture.leagueId, season: fixture.season, capturedAt: bucket } },
        update: {}, create: {
          playerId: latest.playerId, playerName: latest.playerName, teamId, leagueId: fixture.leagueId, season: fixture.season,
          position: latest.position, minutes: sumKnown(playerRows, "minutes"), starts: playerRows.filter((row) => row.starter === true).length,
          appearances: playerRows.length, rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
          goals: sumKnown(playerRows, "goals"), assists: sumKnown(playerRows, "assists"), shots: sumKnown(playerRows, "shots"),
          shotsOnTarget: sumKnown(playerRows, "shotsOnTarget"), passes: sumKnown(playerRows, "passes"), keyPasses: sumKnown(playerRows, "keyPasses"),
          yellowCards: sumKnown(playerRows, "yellowCards"), redCards: sumKnown(playerRows, "redCards"), saves: sumKnown(playerRows, "saves"), conceded: sumKnown(playerRows, "conceded"),
          metrics: json(metrics), sourceAt: latest.sourceAt, capturedAt: bucket,
          completeness: playerRows.reduce((sum, row) => sum + row.completeness, 0) / playerRows.length,
        },
      });
      saved++;
    }
  }
  return saved;
}

async function latestLineup(fixtureId: number, teamId: number) {
  return prisma.fixtureLineupSnapshot.findFirst({ where: { fixtureId, teamId }, orderBy: { capturedAt: "desc" }, include: { players: true } });
}

async function sharedMinutesForLineup(teamId: number, playerIds: number[], kickoff: Date) {
  if (playerIds.length < 2) return null;
  const priorFixtures = await prisma.fixturePrediction.findMany({
    where: { kickoff: { lt: kickoff }, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    orderBy: { kickoff: "desc" }, take: 5, select: { fixtureId: true },
  });
  if (!priorFixtures.length) return null;
  const rows = await prisma.playerMatchSnapshot.findMany({
    where: { teamId, fixtureId: { in: priorFixtures.map((row) => row.fixtureId) }, playerId: { in: playerIds }, capturedAt: { lt: kickoff } },
    select: { fixtureId: true, playerId: true, minutes: true },
  });
  const byFixture = new Map<number, Map<number, number>>();
  for (const row of rows) {
    const fixture = byFixture.get(row.fixtureId) ?? new Map<number, number>();
    fixture.set(row.playerId, row.minutes ?? 0); byFixture.set(row.fixtureId, fixture);
  }
  let shared = 0, possible = 0;
  for (const fixture of byFixture.values()) for (let i = 0; i < playerIds.length; i++) for (let j = i + 1; j < playerIds.length; j++) {
    possible += 90; shared += Math.min(fixture.get(playerIds[i]) ?? 0, fixture.get(playerIds[j]) ?? 0);
  }
  return possible ? shared / possible : null;
}

async function buildFeatures(fixture: { fixtureId: number; kickoff: Date }, teamId: number, calculatedAt: Date) {
  const lineup = await latestLineup(fixture.fixtureId, teamId);
  if (!lineup) return null;
  const history = await prisma.fixtureLineupSnapshot.findMany({
    where: { teamId, kickoff: { lt: fixture.kickoff }, status: "CONFIRMED" }, orderBy: { kickoff: "desc" }, take: 5, include: { players: true },
  });
  const starters = lineup.players.filter((row) => row.role === "STARTER");
  const previous = history[0]?.players.filter((row) => row.role === "STARTER") ?? [];
  const previousIds = new Set(previous.map((row) => row.playerId).filter((id): id is number => id != null));
  const ids = starters.map((row) => row.playerId).filter((id): id is number => id != null);
  const lineupChanges = previous.length ? ids.filter((id) => !previousIds.has(id)).length : null;
  const starts = new Map<number, number>();
  for (const item of history) for (const player of item.players) if (player.role === "STARTER" && player.playerId != null) starts.set(player.playerId, (starts.get(player.playerId) ?? 0) + 1);
  const regularStarters = ids.filter((id) => (starts.get(id) ?? 0) >= 3).length;
  const bench = lineup.players.filter((row) => row.role === "SUBSTITUTE");
  const allKnownIds = [...new Set([...ids, ...bench.map((row) => row.playerId).filter((id): id is number => id != null), ...starts.keys()])];
  const profiles = allKnownIds.length ? await prisma.playerSeasonSnapshot.findMany({ where: { playerId: { in: allKnownIds }, teamId, capturedAt: { lte: calculatedAt } }, orderBy: { capturedAt: "desc" }, distinct: ["playerId"] }) : [];
  const profileMap = new Map(profiles.map((row) => [row.playerId, row]));
  const availability = await prisma.fixtureAvailabilitySnapshot.findMany({ where: { fixtureId: fixture.fixtureId, teamId, capturedAt: { lte: calculatedAt } }, orderBy: { capturedAt: "desc" }, distinct: ["playerName"] });
  const goalkeeper = starters.find((row) => row.position === "G");
  const oldGoalkeeper = previous.find((row) => row.position === "G");
  const defense = starters.filter((row) => row.position === "D" && row.playerId != null);
  const knownProfiles = ids.filter((id) => profileMap.has(id)).length / Math.max(1, ids.length);
  const starting = weightedUnitStrength(starters, profileMap);
  const substituteStrength = weightedUnitStrength(bench, profileMap);
  const usualIds = [...starts.entries()].filter(([, count]) => count >= 3).map(([id]) => id);
  const usualRows = usualIds.map((playerId) => ({ playerId, position: profileMap.get(playerId)?.position ?? null }));
  const usualStrength = weightedUnitStrength(usualRows, profileMap);
  const scorer = profiles.toSorted((a, b) => ((b.goals ?? 0) + .7 * (b.assists ?? 0)) - ((a.goals ?? 0) + .7 * (a.assists ?? 0)))[0];
  const usualGoalkeeperId = history.flatMap((item) => item.players.filter((row) => row.role === "STARTER" && row.position === "G" && row.playerId != null)).map((row) => row.playerId!)[0] ?? null;
  const absenceIds = new Set(availability.map((row) => row.playerId).filter((id): id is number => id != null));
  const importantAbsences = availability.filter((row) => row.playerId != null && playerPersonnelValue(profileMap.get(row.playerId), profileMap.get(row.playerId)?.position).importance >= .6).length;
  const sharedMinutesRatio = await sharedMinutesForLineup(teamId, ids, fixture.kickoff);
  const completeness = Math.min(1, lineup.completeness * .65 + knownProfiles * .25 + .1);
  const values = {
    lineupChanges, regularStarters, defenseContinuity: previous.length ? defense.filter((row) => previousIds.has(row.playerId!)).length / Math.max(1, defense.length) : null,
    goalkeeperContinuity: goalkeeper?.playerId != null && oldGoalkeeper?.playerId != null ? goalkeeper.playerId === oldGoalkeeper.playerId : null,
    formationChanged: history[0]?.formation ? lineup.formation !== history[0].formation : null,
    coachChangedRecently: history[0]?.coachId != null && lineup.coachId != null ? history[0].coachId !== lineup.coachId : null,
    coachMatches: history.filter((row) => row.coachId != null && row.coachId === lineup.coachId).length,
    sharedMinutesRatio,
    startingStrength: starting?.value ?? null, benchStrength: substituteStrength?.value ?? null,
    strengthLoss: starting && usualStrength ? Math.max(0, (usualStrength.value - starting.value) / usualStrength.value) : null,
    missingGoalkeeper: usualGoalkeeperId != null ? !ids.includes(usualGoalkeeperId) || absenceIds.has(usualGoalkeeperId) : null,
    missingKeyScorer: scorer ? !ids.includes(scorer.playerId) || absenceIds.has(scorer.playerId) : null,
    importantAbsences,
  };
  return prisma.fixturePersonnelFeatures.create({ data: {
    fixtureId: fixture.fixtureId, teamId, kickoff: fixture.kickoff, lineupSnapshotId: lineup.id,
    availabilityCapturedAt: availability[0]?.capturedAt ?? null, calculatedAt: minuteBucket(calculatedAt), completeness,
    ...values, features: json({ profileCoverage: knownProfiles, starterIds: ids, substituteIds: bench.map((row) => row.playerId), usualStarterIds: usualIds, keyScorerId: scorer?.playerId ?? null, usualGoalkeeperId, strengthMethod: "shrunk-rating-importance-v1" }),
  } });
}

async function createCollectingShadow(prediction: {
  fixtureId: number; kickoff: Date; homeTeamId: number; awayTeamId: number; modelVersion: number;
  lambdaHome: number; lambdaAway: number; homeWin: number; draw: number; awayWin: number; over25: number; bttsYes: number;
}, at: Date) {
  const [latestShadow, latestHomeLineup, latestAwayLineup] = await Promise.all([
    prisma.shadowForecastSnapshot.findFirst({ where: { fixtureId: prediction.fixtureId, shadowModelVersion: LINEUP_SHADOW_VERSION }, orderBy: { calculatedAt: "desc" } }),
    latestLineup(prediction.fixtureId, prediction.homeTeamId), latestLineup(prediction.fixtureId, prediction.awayTeamId),
  ]);
  if (!latestHomeLineup || !latestAwayLineup || latestHomeLineup.status !== "CONFIRMED" || latestAwayLineup.status !== "CONFIRMED") return null;
  if (latestShadow?.finalized) return null;
  const finalWindow = prediction.kickoff.getTime() - at.getTime() <= 10 * 60_000;
  const lineupChanged = !latestShadow || latestHomeLineup.capturedAt > latestShadow.calculatedAt || latestAwayLineup.capturedAt > latestShadow.calculatedAt;
  if (!lineupChanged && !finalWindow) return null;
  const [home, away] = await Promise.all([buildFeatures(prediction, prediction.homeTeamId, at), buildFeatures(prediction, prediction.awayTeamId, at)]);
  if (!home || !away) return null;
  const probabilities = { home: prediction.homeWin, draw: prediction.draw, away: prediction.awayWin, over25: prediction.over25, bttsYes: prediction.bttsYes };
  const completeness = (home.completeness + away.completeness) / 2;
  return prisma.shadowForecastSnapshot.upsert({
    where: { fixtureId_shadowModelVersion_calculatedAt: { fixtureId: prediction.fixtureId, shadowModelVersion: LINEUP_SHADOW_VERSION, calculatedAt: minuteBucket(at) } },
    update: {}, create: {
      fixtureId: prediction.fixtureId, kickoff: prediction.kickoff, baselineModelVersion: prediction.modelVersion,
      calculatedAt: minuteBucket(at), finalized: finalWindow,
      status: completeness < .75 ? "LOW_CONFIDENCE" : "COLLECTING", homeFeatureId: home.id, awayFeatureId: away.id,
      baselineLambdaHome: prediction.lambdaHome, baselineLambdaAway: prediction.lambdaAway,
      shadowLambdaHome: prediction.lambdaHome, shadowLambdaAway: prediction.lambdaAway,
      baselineProbabilities: json(probabilities), shadowProbabilities: json(probabilities),
      inputs: json({ homeFeatureId: home.id, awayFeatureId: away.id }), completeness,
      explanations: json(["Koeficienty nejsou pred dosažením 300 uzavřených utkání fitovány.", "Veřejná predikce ani portfolio se nemění."]),
    },
  });
}

export async function refreshCoverage(now = new Date()) {
  let processed = 0, errors = 0;
  for (const leagueId of PUBLIC_CLUB_LEAGUE_IDS) {
    const existing = await prisma.leagueDataCoverage.findFirst({ where: { leagueId, season: CURRENT_SEASON }, orderBy: { verifiedAt: "desc" } });
    if (existing && now.getTime() - existing.verifiedAt.getTime() < 23 * 60 * 60_000) continue;
    try {
      const payload = await auditedFetch({ dataType: "COVERAGE", endpoint: "/leagues", leagueId, season: CURRENT_SEASON }, () => fetchLeagueCoverage(leagueId, CURRENT_SEASON), (value) => value.length);
      const season = payload[0]?.seasons.find((row) => row.year === CURRENT_SEASON);
      const coverage = season?.coverage;
      const any = Boolean(coverage);
      await prisma.leagueDataCoverage.upsert({
        where: { leagueId_season_sourceVersion: { leagueId, season: CURRENT_SEASON, sourceVersion: 1 } },
        update: { events: !!coverage?.fixtures?.events, lineups: !!coverage?.fixtures?.lineups, fixtureStats: !!coverage?.fixtures?.statistics_fixtures, playerStats: !!coverage?.fixtures?.statistics_players, standings: !!coverage?.standings, injuries: !!coverage?.injuries, predictions: !!coverage?.predictions, prematchOdds: !!coverage?.odds, status: any ? "SUPPORTED" : "NOT_YET_AVAILABLE", verifiedAt: now },
        create: { leagueId, season: CURRENT_SEASON, modelContext: "LEAGUE", events: !!coverage?.fixtures?.events, lineups: !!coverage?.fixtures?.lineups, fixtureStats: !!coverage?.fixtures?.statistics_fixtures, playerStats: !!coverage?.fixtures?.statistics_players, standings: !!coverage?.standings, injuries: !!coverage?.injuries, predictions: !!coverage?.predictions, prematchOdds: !!coverage?.odds, status: any ? "SUPPORTED" : "NOT_YET_AVAILABLE", verifiedAt: now },
      });
      processed++;
    } catch {
      errors++;
      await prisma.leagueDataCoverage.upsert({
        where: { leagueId_season_sourceVersion: { leagueId, season: CURRENT_SEASON, sourceVersion: 1 } },
        update: { status: "FETCH_FAILED", verifiedAt: now },
        create: { leagueId, season: CURRENT_SEASON, modelContext: "LEAGUE", status: "FETCH_FAILED", verifiedAt: now },
      }).catch(() => {});
    }
  }
  return { processed, errors };
}

export async function collectPersonnelShadow(input: { limit?: number; cursor?: number; now?: Date } = {}) {
  const now = input.now ?? new Date(); const limit = Math.min(12, Math.max(1, input.limit ?? 4)); const cursor = Math.max(0, input.cursor ?? 0);
  const until = new Date(now.getTime() + 48 * 60 * 60_000);
  const all = await prisma.fixturePrediction.findMany({
    where: { modelVersion: MODEL_VERSION, modelContext: "LEAGUE", leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, kickoff: { gt: now, lte: until } },
    orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }], select: { fixtureId: true, kickoff: true, leagueId: true, homeTeamId: true, awayTeamId: true, modelVersion: true, lambdaHome: true, lambdaAway: true, homeWin: true, draw: true, awayWin: true, over25: true, bttsYes: true },
  });
  const batch = all.slice(cursor, cursor + limit); let processed = 0, errors = 0, savedLineups = 0, savedAbsences = 0, shadows = 0;
  if (batch.length) {
    let fixtures = [] as Awaited<ReturnType<typeof fetchFixturesByIds>>;
    try { fixtures = await auditedFetch({ dataType: "FIXTURE_BUNDLE", endpoint: "/fixtures" }, () => fetchFixturesByIds(batch.map((row) => row.fixtureId)), (value) => value.length); } catch { errors += batch.length; }
    const byId = new Map(fixtures.map((row) => [row.fixture.id, row]));
    for (const prediction of batch) {
      try {
        const coverage = await prisma.leagueDataCoverage.findFirst({ where: { leagueId: prediction.leagueId, season: CURRENT_SEASON }, orderBy: { verifiedAt: "desc" } });
        let lineups = byId.get(prediction.fixtureId)?.lineups ?? [];
        const minutes = (prediction.kickoff.getTime() - now.getTime()) / 60_000;
        const lineupMarker = await prisma.apiCache.findUnique({ where: { key: `personnel:lineup:${prediction.fixtureId}` } });
        const lineupCheckDue = !lineupMarker || lineupMarker.expiresAt <= now;
        if (!lineups.length && minutes <= 90 && coverage?.lineups !== false && lineupCheckDue) {
          lineups = await auditedFetch({ dataType: "LINEUP", endpoint: "/fixtures/lineups", fixtureId: prediction.fixtureId, leagueId: prediction.leagueId, season: CURRENT_SEASON }, () => fetchFixtureLineups(prediction.fixtureId), (value) => value.length);
          const retryMinutes = minutes > 60 ? 30 : minutes > 40 ? 20 : minutes > 20 ? 20 : 10;
          await prisma.apiCache.upsert({
            where: { key: `personnel:lineup:${prediction.fixtureId}` },
            update: { payload: json({ count: lineups.length }), expiresAt: new Date(now.getTime() + retryMinutes * 60_000) },
            create: { key: `personnel:lineup:${prediction.fixtureId}`, payload: json({ count: lineups.length }), expiresAt: new Date(now.getTime() + retryMinutes * 60_000) },
          });
        }
        for (const lineup of lineups) if (await saveLineup(prediction.fixtureId, prediction.kickoff, lineup, now)) savedLineups++;
        const availabilityMarker = await prisma.apiCache.findUnique({ where: { key: `personnel:availability:${prediction.fixtureId}` } });
        const cadence = minutes > 720 ? 12 : minutes > 120 ? 3 : 1;
        const availabilityDue = !availabilityMarker || now.getTime() - availabilityMarker.updatedAt.getTime() >= cadence * 60 * 60_000;
        if (coverage?.injuries !== false && availabilityDue) savedAbsences += await saveAvailability(prediction, now);
        const confirmedTeams = await prisma.fixtureLineupSnapshot.groupBy({ by: ["teamId"], where: { fixtureId: prediction.fixtureId, status: "CONFIRMED" } });
        if (confirmedTeams.length >= 2 && await createCollectingShadow(prediction, now)) shadows++;
        processed++;
      } catch { errors++; }
    }
  }
  // Player match collection is deliberately bounded to one missing recent fixture per run.
  const recentFinished = cursor === 0 ? await prisma.fixturePrediction.findMany({
    where: { modelContext: "LEAGUE", leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, status: { in: ["FT", "AET", "PEN"] }, settledAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
    orderBy: { kickoff: "desc" }, take: 20, select: { fixtureId: true },
  }) : [];
  const capturedFixtureIds = recentFinished.length ? new Set((await prisma.playerMatchSnapshot.findMany({
    where: { fixtureId: { in: recentFinished.map((row) => row.fixtureId) } }, distinct: ["fixtureId"], select: { fixtureId: true },
  })).map((row) => row.fixtureId)) : new Set<number>();
  const missing = recentFinished.find((row) => !capturedFixtureIds.has(row.fixtureId));
  let playerRows = 0, playerProfiles = 0;
  if (missing) try {
    const fixturePlayers = await auditedFetch({ dataType: "PLAYER_MATCH", endpoint: "/fixtures/players", fixtureId: missing.fixtureId }, () => fetchFixturePlayers(missing.fixtureId), (value) => value.reduce((sum, team) => sum + team.players.length, 0));
    playerRows = await savePlayerMatch(missing.fixtureId, fixturePlayers, now);
    if (playerRows) playerProfiles = await refreshPlayerSeasonProfiles(missing.fixtureId, now);
  } catch { errors++; }
  const next = cursor + batch.length;
  return { candidates: all.length, processed, errors, savedLineups, savedAbsences, shadows, playerRows, playerProfiles, remaining: Math.max(0, all.length - next), cursor: next < all.length ? String(next) : null, reason: next < all.length ? "BATCH_LIMIT" : null };
}

export async function refreshDailyPlayerProfiles(input: { limit?: number; cursor?: number; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const limit = Math.min(4, Math.max(1, input.limit ?? 2));
  const cursor = Math.max(0, input.cursor ?? 0);
  const fixtures = await prisma.fixturePrediction.findMany({
    // This is an on-demand diagnostic refresh. Keep it focused on teams whose
    // profiles can be used by the near-term personnel shadow pipeline.
    where: { modelContext: "LEAGUE", leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, kickoff: { gt: now, lte: new Date(now.getTime() + 48 * 60 * 60_000) } },
    orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }],
    select: { leagueId: true, season: true, homeTeamId: true, awayTeamId: true },
  });
  const candidateMap = new Map<string, { teamId: number; leagueId: number; season: number }>();
  for (const fixture of fixtures) for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) candidateMap.set(`${teamId}:${fixture.leagueId}:${fixture.season}`, { teamId, leagueId: fixture.leagueId, season: fixture.season });
  const all = [...candidateMap.values()];
  const batch = all.slice(cursor, cursor + limit);
  let processed = 0, saved = 0, skippedFresh = 0, errors = 0;
  const bucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (const candidate of batch) {
    try {
      const fresh = await prisma.playerSeasonSnapshot.findFirst({ where: { ...candidate, capturedAt: { gte: bucket }, metrics: { path: ["source"], equals: "api-football-players" } } });
      if (fresh) { skippedFresh++; processed++; continue; }
      const rows = await auditedFetch({ dataType: "PLAYER_SEASON", endpoint: "/players", ...candidate }, () => fetchTeamSeasonPlayers(candidate.teamId, candidate.leagueId, candidate.season), (value) => value.length);
      for (const row of rows) {
        const stat = row.statistics.find((item) => item.team.id === candidate.teamId && item.league.id === candidate.leagueId);
        if (!stat) continue;
        const values = {
          minutes: numberOf(stat.games?.minutes), starts: numberOf(stat.games?.lineups), appearances: numberOf(stat.games?.appearances), rating: numberOf(stat.games?.rating),
          goals: numberOf(stat.goals?.total), assists: numberOf(stat.goals?.assists), shots: numberOf(stat.shots?.total), shotsOnTarget: numberOf(stat.shots?.on),
          passes: numberOf(stat.passes?.total), keyPasses: numberOf(stat.passes?.key), yellowCards: numberOf(stat.cards?.yellow), redCards: numberOf(stat.cards?.red),
          saves: numberOf(stat.goals?.saves), conceded: numberOf(stat.goals?.conceded),
        };
        const completeness = Object.values(values).filter((value) => value != null).length / Object.keys(values).length;
        await prisma.playerSeasonSnapshot.upsert({
          where: { playerId_teamId_leagueId_season_capturedAt: { playerId: row.player.id, ...candidate, capturedAt: bucket } }, update: {},
          create: { playerId: row.player.id, playerName: row.player.name, ...candidate, position: stat.games?.position ?? null, ...values, metrics: json({ source: "api-football-players", raw: stat }), sourceAt: now, capturedAt: bucket, completeness },
        });
        saved++;
      }
      processed++;
    } catch { errors++; }
  }
  const next = cursor + batch.length;
  return { candidates: all.length, processed, saved, skippedFresh, errors, remaining: Math.max(0, all.length - next), cursor: next < all.length ? String(next) : null, reason: next < all.length ? "BATCH_LIMIT" : null };
}

export async function personnelShadowDashboard(now = new Date()) {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const since = thirtyDaysAgo > PERSONNEL_COLLECTION_STARTED_AT ? thirtyDaysAgo : PERSONNEL_COLLECTION_STARTED_AT;
  const [coverage, fixtureCount, completeFixtures, availabilityFixtures, shadows, playerFixtures, playerProfiles, latestRun, incidents, recent, fetchAttempts] = await Promise.all([
    prisma.leagueDataCoverage.findMany({ where: { season: CURRENT_SEASON }, orderBy: { leagueId: "asc" } }),
    prisma.fixturePrediction.count({ where: { modelContext: "LEAGUE", leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, kickoff: { gte: since, lte: now } } }),
    prisma.fixtureLineupSnapshot.groupBy({ by: ["fixtureId"], where: { kickoff: { gte: since, lte: now }, status: "CONFIRMED" }, _count: { teamId: true } }).then((rows) => rows.filter((row) => row._count.teamId >= 2).length),
    prisma.fixtureAvailabilitySnapshot.groupBy({ by: ["fixtureId"], where: { kickoff: { gte: since, lte: now }, sourceKind: "FIXTURE" } }).then((rows) => rows.length),
    prisma.shadowForecastSnapshot.count({ where: { shadowModelVersion: LINEUP_SHADOW_VERSION } }),
    prisma.playerMatchSnapshot.groupBy({ by: ["fixtureId"] }).then((rows) => rows.length),
    prisma.playerSeasonSnapshot.count({ where: { season: CURRENT_SEASON } }),
    prisma.cronRun.findFirst({ where: { job: "personnel-shadow" }, orderBy: { startedAt: "desc" } }),
    prisma.dataIncident.findMany({ where: { status: "OPEN", kind: { in: ["PERSONNEL_DATA", "COVERAGE"] } }, orderBy: { lastSeenAt: "desc" }, take: 10 }),
    prisma.shadowForecastSnapshot.findMany({ orderBy: { calculatedAt: "desc" }, take: 10 }),
    prisma.personnelFetchAttempt.findMany({ where: { attemptedAt: { gte: since } }, orderBy: { attemptedAt: "desc" }, take: 100 }),
  ]);
  const fixtureIds = recent.map((row) => row.fixtureId);
  const fixtures = fixtureIds.length ? await prisma.fixturePrediction.findMany({
    where: { fixtureId: { in: fixtureIds } },
    select: { fixtureId: true, homeName: true, awayName: true, kickoff: true, leagueId: true },
  }) : [];
  const fixtureById = new Map(fixtures.map((row) => [row.fixtureId, row]));
  const supported = coverage.filter((row) => row.status === "SUPPORTED");
  return {
    status: completeFixtures >= 300 ? "CANDIDATE_FIT" : "COLLECTING",
    fixtureCount, completeFixtures, availabilityFixtures,
    lineupCoverage: fixtureCount ? completeFixtures / fixtureCount : 0,
    availabilityCoverage: fixtureCount ? availabilityFixtures / fixtureCount : 0,
    playerFixtures, playerProfiles, playerCoverage: fixtureCount ? playerFixtures / fixtureCount : 0,
    shadows, milestone: 300, coverage, supportedLeagues: supported.length, latestRun, incidents,
    fetchAttempts, recent: recent.map((row) => ({ ...row, fixture: fixtureById.get(row.fixtureId) ?? null })),
  };
}

export function isSupportedPersonnelLeague(leagueId: number) { return PUBLIC_IDS.has(leagueId); }
