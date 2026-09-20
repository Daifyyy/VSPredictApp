// Explicit one-shot audit import: no retries, DB writes or prediction generation.
// Output is persisted locally by the caller, not by this script.
import { createHash } from "node:crypto";
import { PUBLIC_CLUB_LEAGUE_IDS } from "../lib/data/catalog";
import { z } from "zod";

const pair = z.object({ home: z.number().int().nonnegative().nullable(), away: z.number().int().nonnegative().nullable() });
const item = z.object({
  fixture: z.object({ id: z.number().int().positive(), date: z.string().datetime({ offset: true }), status: z.object({ short: z.string() }) }),
  league: z.object({ id: z.number().int(), season: z.number().int(), round: z.string().nullable().optional() }),
  teams: z.object({ home: z.object({ id: z.number().int().positive() }), away: z.object({ id: z.number().int().positive() }) }),
  goals: pair, score: z.object({ fulltime: pair.optional() }).optional(),
});
async function main() {
  const arg = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.split("=")[1];
  const statusOnly = process.argv.includes("--status");
  const league = Number(arg("league")), season = Number(arg("season"));
  if (!statusOnly && (!(PUBLIC_CLUB_LEAGUE_IDS as readonly number[]).includes(league) || ![2025, 2026].includes(season))) throw new Error("Outside approved 11 leagues / 2025-2026 scope");
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("Missing provider key");
  const url = new URL(statusOnly ? "https://v3.football.api-sports.io/status" : "https://v3.football.api-sports.io/fixtures");
  if (!statusOnly) { url.searchParams.set("league", String(league)); url.searchParams.set("season", String(season)); }
  const response = await fetch(url, { headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}; no retry performed`);
  const body = await response.json();
  if (body.errors && Object.keys(body.errors).length) throw new Error("Provider returned errors; no retry performed");
  if (statusOnly) {
    const requests = z.object({ current: z.number().nonnegative(), limit_day: z.number().positive() }).parse(body.response?.requests);
    const safeLimit = Math.min(5625, Math.floor(requests.limit_day * .75));
    console.log(JSON.stringify({ requests, safeLimit, canFetch22: requests.current + 22 < safeLimit }));
    return;
  }
  const rows = z.array(item).parse(body.response);
  if (body.paging?.current !== 1 || body.paging?.total !== 1 || body.results !== rows.length || !rows.length) throw new Error("Empty or incomplete/paginated inventory: stop, no additional request");
  if (rows.some(r => r.league.id !== league || r.league.season !== season || r.teams.home.id === r.teams.away.id)) throw new Error("Inventory identity mismatch");
  if (new Set(rows.map(r => r.fixture.id)).size !== rows.length) throw new Error("Duplicate fixture IDs");
  const fixtures = rows.map(r => {
    const score = r.score?.fulltime ?? (r.fixture.status.short === "FT" ? r.goals : null);
    return { fixtureId: r.fixture.id, kickoff: r.fixture.date, homeTeamId: r.teams.home.id, awayTeamId: r.teams.away.id,
      status: r.fixture.status.short, round: r.league.round ?? null, homeGoals: score?.home ?? null, awayGoals: score?.away ?? null };
  }).sort((a, b) => a.fixtureId - b.fixtureId);
  const quota = (name: string) => { const value = response.headers.get(name); return value === null ? null : Number(value); };
  console.log(JSON.stringify({ version: 1, source: "API_FOOTBALL_LEAGUE_SEASON_FIXTURES", leagueId: league, season,
    fetchedAt: new Date().toISOString(), apiAttempts: 1, pagination: body.paging, count: fixtures.length,
    providerRemaining: quota("x-ratelimit-requests-remaining"), providerLimit: quota("x-ratelimit-requests-limit"),
    sha256: createHash("sha256").update(JSON.stringify(fixtures)).digest("hex"), fixtures }));
}
main().catch(e => { console.error(e instanceof z.ZodError ? "Invalid provider response schema" : (e as Error).message); process.exitCode = 1; });
