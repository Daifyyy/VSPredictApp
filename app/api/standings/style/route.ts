import { NextResponse } from "next/server";
import { getLeagueStyleSnapshot } from "@/lib/data/repository";
import { publicLeagueStyleSnapshot } from "@/lib/stats/leagueStyle";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";

export async function GET(req: Request) {
  if (!allowRequest(`standings-style:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const leagueId = Number(new URL(req.url).searchParams.get("league"));
  if (!Number.isFinite(leagueId)) return NextResponse.json({ error: "Chybí liga" }, { status: 400 });
  const snapshot = await getLeagueStyleSnapshot(leagueId).catch(() => null);
  return NextResponse.json(
    { snapshot: snapshot ? publicLeagueStyleSnapshot(snapshot) : null, full: false },
    { headers: publicCache(300, 600) }
  );
}
