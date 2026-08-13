import type { ApiFixture } from "./apiFootball";
import type { RefereeProfileForecast } from "@/lib/types";
import { prisma } from "@/lib/db";
import { DEFAULT_CARD_TUNING, normalizeRefereeName, refereeFactor } from "@/lib/picks/cards";
import { fetchFixturesByIds } from "./apiFootball";

const average = (values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;

export function rankPercentile(value: number, peers: number[]): number | null {
  if (peers.length < 2) return null;
  const below = peers.filter((peer) => peer < value).length;
  const equal = peers.filter((peer) => peer === value).length;
  return Math.round(((below + Math.max(0, equal - 1) / 2) / (peers.length - 1)) * 100);
}

/** DB-only point-in-time profil. */
export async function getRefereeProfile(
  name: string,
  leagueId: number,
  before: Date,
  modelContext = "LEAGUE"
): Promise<RefereeProfileForecast> {
  const refereeKey = normalizeRefereeName(name);
  const [matches, leagueRows] = await Promise.all([
    prisma.refereeMatch.findMany({ where: { refereeKey, modelContext, kickoff: { lt: before } }, orderBy: { kickoff: "asc" } }),
    prisma.refereeMatch.findMany({ where: { leagueId, modelContext, kickoff: { lt: before } } }),
  ]);
  const estimate = refereeFactor(
    matches.map((match) => ({ date: match.kickoff.toISOString(), cards: match.actualCards, expected: match.expectedCards })),
    before.toISOString(), DEFAULT_CARD_TUNING.refShrink, DEFAULT_CARD_TUNING.refereeWeight
  );
  const cardsPerMatch = average(matches.map((match) => match.actualCards));
  const foulsPerMatch = average(matches.flatMap((match) => match.fouls == null ? [] : [match.fouls]));
  const byReferee = new Map<string, typeof leagueRows>();
  for (const row of leagueRows) byReferee.set(row.refereeKey, [...(byReferee.get(row.refereeKey) ?? []), row]);
  const peerCards = [...byReferee.values()].map((rows) => average(rows.map((row) => row.actualCards))).filter((v): v is number => v != null);
  const peerFouls = [...byReferee.values()].map((rows) => average(rows.flatMap((row) => row.fouls == null ? [] : [row.fouls]))).filter((v): v is number => v != null);
  const cardPercentile = cardsPerMatch == null ? null : rankPercentile(cardsPerMatch, peerCards);
  const foulPercentile = foulsPerMatch == null ? null : rankPercentile(foulsPerMatch, peerFouls);
  const labels: string[] = [];
  if (matches.length >= 10) {
    if (estimate.factor >= 1.05) labels.push("Přísnější na karty");
    else if (estimate.factor <= 0.95) labels.push("Mírnější na karty");
    if (foulPercentile != null && foulPercentile >= 75) labels.push("Častěji přerušuje");
    else if (foulPercentile != null && foulPercentile <= 25) labels.push("Plynulejší hra");
  }
  return {
    name, sample: estimate.sample, cardsPerMatch, foulsPerMatch,
    redCardsPerMatch: average(matches.map((match) => match.redCards)),
    cardsPerFoul: cardsPerMatch != null && foulsPerMatch ? cardsPerMatch / foulsPerMatch : null,
    cardPercentile, foulPercentile, factor: estimate.factor,
    lambdaBefore: null, lambdaAfter: null, smallSample: matches.length < 10,
    labels: labels.slice(0, 2), updatedAt: matches.at(-1)?.updatedAt.toISOString() ?? null,
  };
}

/** Bez upstream fetchů uloží použitelné historické řádky z již zahřáté cache. */
export async function ingestRefereeHistory(fixtures: ApiFixture[]): Promise<void> {
  const assigned = fixtures.filter((fixture) => normalizeRefereeName(fixture.fixture.referee ?? ""));
  if (!assigned.length) return;
  const ids = assigned.map((fixture) => fixture.fixture.id);
  const [predictions, stats] = await Promise.all([
    prisma.fixturePrediction.findMany({ where: { fixtureId: { in: ids }, lambdaCardsHome: { not: null } } }),
    prisma.matchStatCache.findMany({ where: { fixtureId: { in: ids } } }),
  ]);
  const predictionById = new Map(predictions.map((row) => [row.fixtureId, row]));
  const statsById = new Map<number, typeof stats>();
  for (const row of stats) statsById.set(row.fixtureId, [...(statsById.get(row.fixtureId) ?? []), row]);
  for (const fixture of assigned) {
    const prediction = predictionById.get(fixture.fixture.id);
    const rows = statsById.get(fixture.fixture.id) ?? [];
    const home = rows.find((row) => row.teamId === fixture.teams.home.id);
    const away = rows.find((row) => row.teamId === fixture.teams.away.id);
    if (!prediction || !home || !away || home.yellowCards == null || away.yellowCards == null) continue;
    const refereeName = fixture.fixture.referee!;
    const refereeKey = normalizeRefereeName(refereeName);
    const factor = prediction.refereeFactor || 1;
    const expectedCards =
      (prediction.lambdaCardsHomeBeforeRef ?? prediction.lambdaCardsHome! / factor) +
      (prediction.lambdaCardsAwayBeforeRef ?? prediction.lambdaCardsAway! / factor);
    const yellowCards = home.yellowCards + away.yellowCards;
    const redCards = (home.redCards ?? 0) + (away.redCards ?? 0);
    const data = {
      refereeName, refereeKey, leagueId: prediction.leagueId,
      modelContext: prediction.modelContext, contextVersion: prediction.contextVersion,
      kickoff: prediction.kickoff,
      fouls: home.fouls != null && away.fouls != null ? home.fouls + away.fouls : null,
      yellowCards, redCards, actualCards: yellowCards + redCards, expectedCards,
    };
    await prisma.refereeMatch.upsert({ where: { fixtureId: fixture.fixture.id }, create: { fixtureId: fixture.fixture.id, ...data }, update: data });
  }
}

export async function refreshUpcomingReferees(now = new Date()) {
  const candidates = await prisma.fixturePrediction.findMany({
    where: {
      status: "NS",
      kickoff: { gt: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
      refereeName: null,
      lambdaCardsHomeBeforeRef: { not: null },
      lambdaCardsAwayBeforeRef: { not: null },
    },
    orderBy: { kickoff: "asc" },
    take: 100,
  });
  let batches = 0;
  let assigned = 0;
  let updated = 0;
  for (let index = 0; index < candidates.length; index += 20) {
    const chunk = candidates.slice(index, index + 20);
    const fixtures = await fetchFixturesByIds(chunk.map((row) => row.fixtureId));
    batches++;
    const byId = new Map(fixtures.map((fixture) => [fixture.fixture.id, fixture]));
    for (const row of chunk) {
      const refereeName = byId.get(row.fixtureId)?.fixture.referee?.trim();
      if (!refereeName) continue;
      assigned++;
      const profile = await getRefereeProfile(refereeName, row.leagueId, row.kickoff, row.modelContext);
      await prisma.fixturePrediction.update({
        where: { fixtureId: row.fixtureId },
        data: {
          refereeName,
          refereeKey: normalizeRefereeName(refereeName),
          refereeFactor: profile.factor,
          refereeSample: profile.sample,
          lambdaCardsHome: Math.min(8, Math.max(0.3, row.lambdaCardsHomeBeforeRef! * profile.factor)),
          lambdaCardsAway: Math.min(8, Math.max(0.3, row.lambdaCardsAwayBeforeRef! * profile.factor)),
          predictedAt: now,
        },
      });
      updated++;
    }
  }
  return { candidates: candidates.length, batches, assigned, updated };
}
