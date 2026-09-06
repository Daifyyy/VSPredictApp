import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { fetchFixturesByIds, LIVE_STATUSES } from "@/lib/data/apiFootball";
import { captureLiveFixture, liveCenterFromCache, settleLiveCandidates } from "@/lib/data/liveCenterStore";
import { prisma } from "@/lib/db";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

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
    const venue = venueId ? await prisma.venueCache.findUnique({ where: { venueId } }) : null;
    const isPro = user?.tier === "PRO";
    return NextResponse.json({
      match: data.match,
      venue,
      model: isPro ? data.model : null,
      odds: isPro ? data.odds : [],
      candidates: isPro ? data.candidates : [],
      pro: isPro,
      updatedAt: data.match?.observedAt ?? null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/match-center", error, { fixtureId });
    return NextResponse.json({ error: "Živý Match Center se nepodařilo načíst" }, { status: 502 });
  }
}
