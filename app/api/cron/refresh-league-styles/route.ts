import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { isRealDataConfigured } from "@/lib/db";
import { PUBLIC_CLUB_LEAGUES } from "@/lib/data/catalog";
import { getLeagueStyleSnapshot, refreshLeagueStyleSnapshot } from "@/lib/data/realRepository";

export const maxDuration = 60;

/** Jedna liga na jeden běh; plánovač rozloží 18 chráněných volání během dne. */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!isRealDataConfigured()) return NextResponse.json({ error: "Reálná data nejsou nakonfigurována" }, { status: 400 });
  const leagueId = Number(new URL(req.url).searchParams.get("league"));
  if (!PUBLIC_CLUB_LEAGUES.some((league) => league.id === leagueId)) {
    return NextResponse.json({ error: "Neplatná klubová liga" }, { status: 400 });
  }
  const existing = await getLeagueStyleSnapshot(leagueId);
  const allowCold = new URL(req.url).searchParams.get("cold") === "1";
  if (!existing && !allowCold) {
    return NextResponse.json({ leagueId, status: "pending-initialization" }, { status: 202 });
  }
  const snapshot = await refreshLeagueStyleSnapshot(leagueId);
  return NextResponse.json({
    leagueId,
    updatedAt: snapshot.updatedAt,
    coverage: snapshot.coverage,
  });
}
