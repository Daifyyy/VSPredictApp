import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { getLeagueStyleSnapshot } from "@/lib/data/repository";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";

export async function GET(req: Request) {
  if (!allowRequest(`standings-style-full:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Přihlášení je vyžadováno" }, { status: 401 });
  if (user.tier !== "PRO") return NextResponse.json({ error: "Vyžaduje PRO" }, { status: 403 });
  const leagueId = Number(new URL(req.url).searchParams.get("league"));
  if (!Number.isFinite(leagueId)) return NextResponse.json({ error: "Chybí liga" }, { status: 400 });
  const snapshot = await getLeagueStyleSnapshot(leagueId).catch(() => null);
  return NextResponse.json(
    { snapshot, full: true },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
