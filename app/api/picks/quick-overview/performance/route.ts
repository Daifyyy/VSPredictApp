import { NextResponse } from "next/server";
import { z } from "zod";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";
import { logError } from "@/lib/logError";
import { computeQuickPerformance, readQuickPerformance } from "@/lib/data/quickPerformanceStore";

const querySchema = z.object({ context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE") });
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`quick-performance:${clientKey(request)}`, 40, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný kontext" }, { status: 400 });
  try {
    if (process.env.RESOURCE_SAVING_READS_ENABLED === 'true') {
      const stored = await readQuickPerformance(parsed.data.context);
      if (!stored.report) return NextResponse.json({
        error: "Souhrn výkonnosti zatím není připraven.", asOf: stored.asOf, stale: true, limitedReason: stored.limitedReason,
      }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' } });
      return NextResponse.json({ ...stored.report, asOf: stored.asOf, stale: stored.stale, limitedReason: stored.limitedReason },
        { headers: stored.stale ? { 'Cache-Control': 'no-store' } : publicCache(300, 900) });
    }
    const report = await computeQuickPerformance(parsed.data.context);
    return NextResponse.json({ ...report, stale: false, limitedReason: null }, { headers: publicCache(300, 900) });
  } catch (error) {
    logError("api/picks/quick-overview/performance", error);
    return NextResponse.json({ error: "Výkonnost rychlého přehledu se nepodařilo načíst" }, { status: 502 });
  }
}
