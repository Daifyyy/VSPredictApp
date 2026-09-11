import { prisma } from "@/lib/db";
import { CLUB_ELO_MODEL_VERSION, DEFAULT_ELO_CONFIG, eloProbabilities, replayElo, type EloTeamState } from "@/lib/picks/clubElo";

function contextOf(modelContext: string) {
  return modelContext === "EURO_CUP" ? "EURO_CUP" : "LEAGUE";
}

/** Idempotentní doplnění výsledků, které už settlement bezpečně uložil. */
export async function syncClubEloMatches() {
  const rows = await prisma.fixturePrediction.findMany({
    where: { homeGoals: { not: null }, awayGoals: { not: null }, status: { in: ["FT", "AET", "PEN"] }, modelContext: { in: ["LEAGUE", "EURO_CUP"] } },
    select: { fixtureId: true, leagueId: true, season: true, kickoff: true, homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true, modelContext: true },
    orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }],
  });
  if (!rows.length) return 0;
  await prisma.$transaction(rows.map((row) => prisma.clubEloMatch.upsert({
    where: { fixtureId: row.fixtureId },
    create: { fixtureId: row.fixtureId, leagueId: row.leagueId, season: row.season, kickoff: row.kickoff, homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId, homeGoals: row.homeGoals!, awayGoals: row.awayGoals!, context: contextOf(row.modelContext) },
    update: { leagueId: row.leagueId, season: row.season, kickoff: row.kickoff, homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId, homeGoals: row.homeGoals!, awayGoals: row.awayGoals!, context: contextOf(row.modelContext) },
  })));
  return rows.length;
}

function snapshotData(fixture: { fixtureId: number; homeTeamId: number; awayTeamId: number }, home: EloTeamState, away: EloTeamState) {
  const long = eloProbabilities(home.long, away.long, DEFAULT_ELO_CONFIG.homeAdvantage);
  const fast = eloProbabilities(home.fast, away.fast, DEFAULT_ELO_CONFIG.homeAdvantage);
  const w = DEFAULT_ELO_CONFIG.longBlend;
  return {
    fixtureId: fixture.fixtureId, modelVersion: CLUB_ELO_MODEL_VERSION, generatedAt: new Date(),
    homeLongRating: home.long, awayLongRating: away.long, homeFastRating: home.fast, awayFastRating: away.fast,
    homeLongSample: home.longSample, awayLongSample: away.longSample, homeFastSample: home.fastSample, awayFastSample: away.fastSample,
    homeProbability: w * long.home + (1 - w) * fast.home, drawProbability: w * long.draw + (1 - w) * fast.draw, awayProbability: w * long.away + (1 - w) * fast.away,
    longHomeProb: long.home, longAwayProb: long.away, fastHomeProb: fast.home, fastAwayProb: fast.away,
  };
}

export async function refreshClubElo(now = new Date()) {
  const synced = await syncClubEloMatches();
  const currentSeason = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const matches = await prisma.clubEloMatch.findMany({ where: { season: { gte: currentSeason - 3 } }, orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }] });
  const replay = replayElo(matches);
  const upcoming = await prisma.fixturePrediction.findMany({
    where: { kickoff: { gt: now, lte: new Date(now.getTime() + 8 * 86_400_000) }, available: true, modelContext: { in: ["LEAGUE", "EURO_CUP"] } },
    select: { fixtureId: true, leagueId: true, season: true, homeTeamId: true, awayTeamId: true },
  });
  const stateOps = [...replay.states.values()].map((state) => prisma.clubEloState.upsert({
    where: { modelVersion_teamId: { modelVersion: CLUB_ELO_MODEL_VERSION, teamId: state.teamId } },
    create: { modelVersion: CLUB_ELO_MODEL_VERSION, teamId: state.teamId, leagueId: state.leagueId, longRating: state.long, fastRating: state.fast, longSample: state.longSample, fastSample: state.fastSample, lastMatchAt: state.lastMatchAt },
    update: { leagueId: state.leagueId, longRating: state.long, fastRating: state.fast, longSample: state.longSample, fastSample: state.fastSample, lastMatchAt: state.lastMatchAt },
  }));
  const snapshotOps = upcoming.flatMap((fixture) => {
    const home = replay.states.get(fixture.homeTeamId), away = replay.states.get(fixture.awayTeamId);
    if (!home || !away) return [];
    const data = snapshotData(fixture, home, away);
    return [prisma.clubEloFixtureSnapshot.upsert({ where: { fixtureId_modelVersion: { fixtureId: fixture.fixtureId, modelVersion: CLUB_ELO_MODEL_VERSION } }, create: data, update: data })];
  });
  await prisma.clubEloModelDefinition.upsert({
    where: { version: CLUB_ELO_MODEL_VERSION },
    create: { version: CLUB_ELO_MODEL_VERSION, status: "ACTIVE", parameters: DEFAULT_ELO_CONFIG, trainedThrough: matches.at(-1)?.kickoff, activatedAt: now },
    update: { parameters: DEFAULT_ELO_CONFIG, trainedThrough: matches.at(-1)?.kickoff, status: "ACTIVE" },
  });
  for (let i = 0; i < stateOps.length; i += 200) await prisma.$transaction(stateOps.slice(i, i + 200));
  for (let i = 0; i < snapshotOps.length; i += 200) await prisma.$transaction(snapshotOps.slice(i, i + 200));
  return { candidates: matches.length, processed: replay.states.size, snapshots: snapshotOps.length, synced, errors: 0, remaining: 0 };
}
