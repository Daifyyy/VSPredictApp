import { fetchFixtureLineups, fetchFixturesByIds, fetchLeagueRecentFixtures } from "../lib/data/apiFootball.ts";

const leagueId = Number(process.argv.find((arg) => arg.startsWith("--league="))?.split("=")[1] ?? 345);
const season = Number(process.argv.find((arg) => arg.startsWith("--season="))?.split("=")[1] ?? 2026);

async function main() {
  const recent = await fetchLeagueRecentFixtures(leagueId, season, 1);
  const fixture = recent[0];
  if (!fixture) throw new Error("Liga nemá dostupný odehraný zápas.");
  const enriched = await fetchFixturesByIds([fixture.fixture.id]);
  const embedded = enriched[0]?.lineups ?? [];
  const direct = embedded.length ? [] : await fetchFixtureLineups(fixture.fixture.id);
  console.log(JSON.stringify({
    fixtureId: fixture.fixture.id,
    match: `${fixture.teams.home.name} – ${fixture.teams.away.name}`,
    embedded: embedded.map((item) => ({ team: item.team.name, formation: item.formation, coach: item.coach?.name })),
    direct: direct.map((item) => ({ team: item.team.name, formation: item.formation, coach: item.coach?.name })),
    calls: embedded.length ? 2 : 3,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
