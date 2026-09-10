import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { withCronRun } from "@/lib/operations";
import { refreshDailyPlayerProfiles } from "@/lib/data/personnelShadow";

export const maxDuration = 60;
export async function GET(request: Request) {
  if (!isRealDataConfigured()) return NextResponse.json({ error: "Mock reĹľim" }, { status: 400 });
  const denied = requireCronAuth(request); if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(4, Number(params.get("limit")) || 2));
  const cursor = Math.max(0, Number(params.get("cursor")) || 0);
  try {
    const result = await withCronRun("player-profiles", () => refreshDailyPlayerProfiles({ limit, cursor }));
    return cronJson("cron/player-profiles", result, result.errors, result.processed);
  } catch (error) {
    logError("cron/player-profiles", error);
    return NextResponse.json({ error: "DennĂ­ profily hrĂˇÄŤĹŻ se nepodaĹ™ilo obnovit" }, { status: 502 });
  }
}
