import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { loadTeamProfile } from "@/lib/data/teamProfile";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export async function GET(req: Request, context: { params: Promise<{ teamId: string }> }) {
  if (!allowRequest(`team-profile:${clientKey(req)}`, 40, 60_000)) return tooMany();
  const { teamId: rawTeamId } = await context.params;
  const teamId = Number(rawTeamId);
  const leagueId = Number(new URL(req.url).searchParams.get("league"));
  if (!Number.isFinite(teamId) || teamId <= 0 || !Number.isFinite(leagueId) || leagueId <= 0) {
    return NextResponse.json({ error: "Neplatný tým nebo liga" }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const entitlement = getEntitlement(user ? { tier: user.tier, proTrialUsed: user.proTrialUsed } : null);
    const profile = await loadTeamProfile(teamId, leagueId, entitlement.pro);
    if (!profile) return NextResponse.json({ error: "Tým nenalezen" }, { status: 404 });
    return NextResponse.json({ ...profile, locked: !entitlement.pro });
  } catch (error) {
    logError("api/team-profile", error, { teamId, leagueId });
    return NextResponse.json({ error: "Profil týmu se nepodařilo načíst" }, { status: 502 });
  }
}
