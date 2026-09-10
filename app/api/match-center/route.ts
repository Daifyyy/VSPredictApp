import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { fetchFixturesByIds, LIVE_STATUSES } from "@/lib/data/apiFootball";
import { captureLiveFixture, liveCenterFromCache, settleLiveCandidates } from "@/lib/data/liveCenterStore";
import { prisma } from "@/lib/db";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

type CachedVenue = { name: string | null; address: string | null; city: string | null; capacity: number | null; surface: string | null; imageUrl: string | null };

function sameVenue(left: string | null | undefined, right: string | null | undefined) {
  const normalize = (value: string | null | undefined) => value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

async function cachedHomeVenue(homeTeamId: number, venueName: string | null): Promise<CachedVenue | null> {
  if (!venueName) return null;
  const known = await prisma.venueCache.findFirst({ where: { name: { equals: venueName, mode: "insensitive" } } });
  if (known) return known;
  const caches = await prisma.apiCache.findMany({ where: { key: { startsWith: "teams:v2:" } }, select: { payload: true } });
  for (const cache of caches) {
    if (!Array.isArray(cache.payload)) continue;
    for (const value of cache.payload) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as { team?: { id?: unknown }; venue?: { id?: unknown; name?: unknown; address?: unknown; city?: unknown; capacity?: unknown; surface?: unknown; image?: unknown } };
      if (Number(row.team?.id) !== homeTeamId || !sameVenue(typeof row.venue?.name === "string" ? row.venue.name : null, venueName)) continue;
      const venue = {
        name: typeof row.venue?.name === "string" ? row.venue.name : venueName,
        address: typeof row.venue?.address === "string" ? row.venue.address : null,
        city: typeof row.venue?.city === "string" ? row.venue.city : null,
        capacity: typeof row.venue?.capacity === "number" ? row.venue.capacity : null,
        surface: typeof row.venue?.surface === "string" ? row.venue.surface : null,
        imageUrl: typeof row.venue?.image === "string" ? row.venue.image : null,
      };
      const cachedVenueId = Number(row.venue?.id);
      if (Number.isInteger(cachedVenueId) && cachedVenueId > 0) {
        await prisma.venueCache.upsert({
          where: { venueId: cachedVenueId },
          update: { ...venue, fetchedAt: new Date() },
          create: { venueId: cachedVenueId, ...venue, fetchedAt: new Date() },
        });
      }
      return venue;
    }
  }
  return null;
}

export async function GET(req: Request) {
  if (!allowRequest(`match-center:${clientKey(req)}`, 30, 60_000)) return tooMany();
  const fixtureId = Number(new URL(req.url).searchParams.get("fixture"));
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) return NextResponse.json({ error: "Neplatný zápas" }, { status: 400 });
  const user = await getCurrentUser();
  try {
    const latest = await prisma.liveMatchSnapshot.findFirst({ where: { fixtureId }, orderBy: { observedAt: "desc" } });
    if (!latest || Date.now() - latest.observedAt.getTime() >= 45_000) {
      const fixture = (await fetchFixturesByIds([fixtureId]))[0];
      if (fixture) {
        if (LIVE_STATUSES.has(fixture.fixture.status.short)) await captureLiveFixture(fixture);
        else await settleLiveCandidates(fixture);
      }
    }
    const data = await liveCenterFromCache(fixtureId);
    const refreshed = await prisma.liveMatchSnapshot.findFirst({ where: { fixtureId }, orderBy: { observedAt: "desc" } });
    const venueId = refreshed?.venueId ?? null;
    const [venueById, lineupRows] = await Promise.all([
      venueId ? prisma.venueCache.findUnique({ where: { venueId } }) : Promise.resolve(null),
      prisma.fixtureLineupSnapshot.findMany({
        where: { fixtureId },
        orderBy: { capturedAt: "desc" },
        include: { players: { orderBy: [{ role: "asc" }, { sourceOrder: "asc" }] } },
      }),
    ]);
    const venue = venueById ?? await cachedHomeVenue(refreshed?.homeTeamId ?? 0, refreshed?.venueName ?? null);
    const latestLineups = [...new Map(lineupRows.map((row) => [row.teamId, row])).values()];
    const isPro = user?.tier === "PRO";
    return NextResponse.json({
      match: data.match,
      venue,
      model: isPro ? data.model : null,
      odds: isPro ? data.odds : [],
      candidates: isPro ? data.candidates : [],
      lineups: latestLineups.map((row) => ({
        teamId: row.teamId,
        status: row.status,
        formation: row.formation,
        coachName: row.coachName,
        capturedAt: row.capturedAt,
        completeness: row.completeness,
        starters: row.players.filter((player) => player.role === "STARTER").map((player) => ({ playerId: player.playerId, name: player.playerName, number: player.shirtNumber, position: player.position })),
        substitutes: row.players.filter((player) => player.role === "SUBSTITUTE").map((player) => ({ playerId: player.playerId, name: player.playerName, number: player.shirtNumber, position: player.position })),
      })),
      pro: isPro,
      updatedAt: data.match?.observedAt ?? null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/match-center", error, { fixtureId });
    return NextResponse.json({ error: "Živý Match Center se nepodařilo načíst" }, { status: 502 });
  }
}
