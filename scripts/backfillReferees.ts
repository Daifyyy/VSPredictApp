/**
 * Point-in-time backfill historie rozhodčích z existující MatchStatCache.
 * API spotřeba: přesně jeden seznam `/fixtures` na sezonu; žádné per-fixture statistiky.
 * Použití: npm run backfill-referees -- --league=345
 */
import { prisma } from "../lib/db.ts";
import { CURRENT_SEASON, PREVIOUS_SEASON } from "../lib/data/catalog.ts";
import { fetchLeagueSeasonFixtures, FINISHED_STATUSES, type ApiFixture } from "../lib/data/apiFootball.ts";
import { backtestCards } from "../lib/picks/cards.ts";
import type { HistoryMatch } from "../lib/picks/backtest.ts";
import type { Metric } from "../lib/types.ts";

async function main() {
const leagueArg = process.argv.find((value) => value.startsWith("--league="));
const leagueId = Number(leagueArg?.split("=")[1]);
if (!Number.isInteger(leagueId) || leagueId <= 0) throw new Error("Použij --league=<API league ID>.");

const seasons = [PREVIOUS_SEASON, CURRENT_SEASON];
const lists = await Promise.all(seasons.map((season) => fetchLeagueSeasonFixtures(leagueId, season)));
const fixtures = lists.flat().filter((fixture) =>
  FINISHED_STATUSES.has(fixture.fixture.status.short) && fixture.fixture.referee?.trim()
);
const fixtureIds = fixtures.map((fixture) => fixture.fixture.id);
const stats = fixtureIds.length ? await prisma.matchStatCache.findMany({ where: { fixtureId: { in: fixtureIds }, context: "league" } }) : [];
const byFixture = new Map<number, typeof stats>();
for (const row of stats) byFixture.set(row.fixtureId, [...(byFixture.get(row.fixtureId) ?? []), row]);

function metrics(row: (typeof stats)[number], opponent: (typeof stats)[number]): Partial<Record<Metric, number>> {
  const cards = row.yellowCards == null ? undefined : row.yellowCards + (row.redCards ?? 0);
  const opponentCards = opponent.yellowCards == null ? undefined : opponent.yellowCards + (opponent.redCards ?? 0);
  return {
    ...(cards != null ? { CARDS: cards } : {}),
    ...(opponentCards != null ? { CARDS_AGAINST: opponentCards } : {}),
    ...(row.fouls != null ? { FOULS: row.fouls } : {}),
    ...(opponent.fouls != null ? { FOULS_AGAINST: opponent.fouls } : {}),
  };
}

function historyOf(fixture: ApiFixture): HistoryMatch | null {
  const rows = byFixture.get(fixture.fixture.id) ?? [];
  const home = rows.find((row) => row.teamId === fixture.teams.home.id);
  const away = rows.find((row) => row.teamId === fixture.teams.away.id);
  const homeGoals = fixture.score.fulltime?.home ?? fixture.goals.home;
  const awayGoals = fixture.score.fulltime?.away ?? fixture.goals.away;
  if (!home || !away || homeGoals == null || awayGoals == null || home.yellowCards == null || away.yellowCards == null) return null;
  return {
    fixtureId: fixture.fixture.id,
    date: fixture.fixture.date,
    season: fixture.league.season,
    leagueId: fixture.league.id,
    homeId: fixture.teams.home.id,
    awayId: fixture.teams.away.id,
    homeName: fixture.teams.home.name,
    awayName: fixture.teams.away.name,
    homeLogo: fixture.teams.home.logo,
    awayLogo: fixture.teams.away.logo,
    homeGoals,
    awayGoals,
    homeMetrics: metrics(home, away),
    awayMetrics: metrics(away, home),
    referee: fixture.fixture.referee?.trim() || undefined,
  };
}

const history = fixtures.flatMap((fixture) => {
  const match = historyOf(fixture);
  return match ? [match] : [];
}).sort((a, b) => a.date.localeCompare(b.date));
const rows = backtestCards(history, { seasons, minMatches: 0 });
const fixtureById = new Map(fixtures.map((fixture) => [fixture.fixture.id, fixture]));
let saved = 0;
for (const row of rows) {
  const fixture = fixtureById.get(row.fixtureId);
  const cached = byFixture.get(row.fixtureId) ?? [];
  const home = cached.find((item) => item.teamId === fixture?.teams.home.id);
  const away = cached.find((item) => item.teamId === fixture?.teams.away.id);
  const refereeName = fixture?.fixture.referee?.trim();
  if (!fixture || !refereeName || !row.referee) continue;
  const expectedCards = row.refereeFactor > 0 ? row.lambdaTotal / row.refereeFactor : row.lambdaTotal;
  await prisma.refereeMatch.upsert({
    where: { fixtureId: row.fixtureId },
    create: {
      fixtureId: row.fixtureId, refereeName, refereeKey: row.referee, leagueId,
      modelContext: "LEAGUE", contextVersion: 1, kickoff: new Date(row.kickoff),
      fouls: home?.fouls != null && away?.fouls != null ? home.fouls + away.fouls : null,
      yellowCards: (home?.yellowCards ?? 0) + (away?.yellowCards ?? 0),
      redCards: (home?.redCards ?? 0) + (away?.redCards ?? 0),
      actualCards: row.actualTotal, expectedCards,
    },
    update: {
      refereeName, refereeKey: row.referee,
      fouls: home?.fouls != null && away?.fouls != null ? home.fouls + away.fouls : null,
      yellowCards: (home?.yellowCards ?? 0) + (away?.yellowCards ?? 0),
      redCards: (home?.redCards ?? 0) + (away?.redCards ?? 0),
      actualCards: row.actualTotal, expectedCards,
    },
  });
  saved++;
}

const unique = new Set(rows.map((row) => row.referee).filter(Boolean)).size;
console.log(JSON.stringify({ leagueId, seasons, apiCalls: seasons.length, fixturesWithReferee: fixtures.length, cachedUsable: history.length, saved, uniqueReferees: unique }, null, 2));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
