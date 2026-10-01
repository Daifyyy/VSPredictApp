import { NextResponse } from "next/server";
import { computeLivePerformance, readLivePerformance, publicLiveCards } from "@/lib/data/livePerformanceStore";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`model-lab-live:${clientKey(request)}`, 30, 60_000)) return tooMany();
  try {
    const detail = new URL(request.url).searchParams.get("detail") === "true";
    const user = detail ? await getCurrentUser() : null;
    if (detail && !getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
    const saving = process.env.RESOURCE_SAVING_READS_ENABLED === 'true';
    const stored = saving ? await readLivePerformance() : null;
    const report = saving ? stored!.report : await computeLivePerformance();
    if (!report) return NextResponse.json({
      error: 'Live souhrn zatím není připravený. Administrátor jej může vytvořit v Provozu.',
      asOf: null, stale: true, limitedReason: stored?.limitedReason,
    }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' } });
    return NextResponse.json({
      cards: detail ? report.cards : publicLiveCards(report),
      asOf: report.asOf, stale: stored?.stale ?? false, limitedReason: stored?.limitedReason ?? null,
    }, { headers: { 'Cache-Control': detail ? 'private, no-store' : stored?.stale ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=300' } });
  } catch (error) {
    logError("api/picks/model-lab/live", error);
    return NextResponse.json({ error: "Live modely se nepodařilo načíst" }, { status: 502 });
  }
}
