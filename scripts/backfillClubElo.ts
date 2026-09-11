import { prisma } from "../lib/db";
import { EURO_LEAGUE_IDS, CLUB_LEAGUES, CURRENT_SEASON } from "../lib/data/catalog";
import { fetchLeagueSeasonFixtures, FINISHED_STATUSES } from "../lib/data/apiFootball";
import { fullTimeGoals } from "../lib/data/fixtures";

async function main() {
 const leagueIds = [...CLUB_LEAGUES.map((league) => league.id), ...EURO_LEAGUE_IDS];
 const seasons = [CURRENT_SEASON - 3, CURRENT_SEASON - 2, CURRENT_SEASON - 1, CURRENT_SEASON];
 for (const leagueId of leagueIds) for (const season of seasons) {
  const fixtures = await fetchLeagueSeasonFixtures(leagueId, season);
  const finished = fixtures.flatMap((fixture) => {
    if (!FINISHED_STATUSES.has(fixture.fixture.status.short)) return [];
    const score = fullTimeGoals(fixture); if (!score) return [];
    return [{ fixtureId: fixture.fixture.id, leagueId, season, kickoff: new Date(fixture.fixture.date), homeTeamId: fixture.teams.home.id, awayTeamId: fixture.teams.away.id, homeGoals: score.home, awayGoals: score.away, context: EURO_LEAGUE_IDS.includes(leagueId) ? "EURO_CUP" : "LEAGUE" }];
  });
  for (let i = 0; i < finished.length; i += 200) await prisma.$transaction(finished.slice(i, i + 200).map((row) => prisma.clubEloMatch.upsert({ where: { fixtureId: row.fixtureId }, create: row, update: row })));
  console.log(`${leagueId}/${season}: ${finished.length}`);
 }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
