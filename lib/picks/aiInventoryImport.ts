import { z } from 'zod';

const score = z.object({ home: z.number().int().nonnegative().nullable(), away: z.number().int().nonnegative().nullable() });
const fixture = z.object({
  fixture: z.object({ id: z.number().int().positive(), date: z.string().datetime({ offset: true }), status: z.object({ short: z.string() }) }),
  league: z.object({ id: z.number().int(), season: z.number().int(), round: z.string().nullable().optional() }),
  teams: z.object({ home: z.object({ id: z.number().int().positive() }), away: z.object({ id: z.number().int().positive() }) }),
  goals: score, score: z.object({ fulltime: score.optional() }).optional(),
});
export const AI_INVENTORY_LEAGUES = [39, 61, 78, 135, 140] as const;
export function inventoryQuota(current: number, limit: number, remainingCalls: number) {
  if (![current, limit, remainingCalls].every(Number.isInteger) || current < 0 || limit <= 0 || remainingCalls < 0) throw Error('INVALID_PROVIDER_QUOTA');
  const safeLimit = Math.min(5625, Math.floor(limit * .75));
  return { current, limit, safeLimit, allowed: current + remainingCalls <= safeLimit };
}
export function parseAIInventory(body: unknown, leagueId: number) {
  if (!(AI_INVENTORY_LEAGUES as readonly number[]).includes(leagueId)) throw Error('OUTSIDE_APPROVED_SCOPE');
  const parsed = z.object({ errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
    paging: z.object({ current: z.literal(1), total: z.literal(1) }), results: z.number().int().positive(), response: z.array(fixture) }).parse(body);
  if (Object.keys(parsed.errors).length || parsed.results !== parsed.response.length) throw Error('INCOMPLETE_OR_PROVIDER_ERROR');
  const ids = new Set<number>();
  const fixtures = parsed.response.map(r => {
    if (r.league.id !== leagueId || r.league.season !== 2024 || r.teams.home.id === r.teams.away.id || ids.has(r.fixture.id)) throw Error('INVENTORY_IDENTITY_MISMATCH');
    ids.add(r.fixture.id);
    const fulltime = r.score?.fulltime ?? (r.fixture.status.short === 'FT' ? r.goals : null);
    return { fixtureId: r.fixture.id, kickoff: r.fixture.date, homeTeamId: r.teams.home.id, awayTeamId: r.teams.away.id,
      status: r.fixture.status.short, round: r.league.round ?? null, homeGoals: fulltime?.home ?? null, awayGoals: fulltime?.away ?? null };
  }).sort((a,b) => a.fixtureId-b.fixtureId);
  return { pagination: parsed.paging, fixtures };
}
