import { NextResponse } from "next/server";
import { ruleSchema } from "@/lib/picks/rules";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";
import { logError } from "@/lib/logError";
import { computeLegacyStats, readLegacyStats } from "@/lib/data/legacyStatsStore";

// Public historical aggregates only. Saving reads never rebuild history on cache miss.
export async function GET(req: Request) {
  if (!allowRequest(`picks-stats:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const sp = new URL(req.url).searchParams;
  const parsed = ruleSchema.safeParse({
    market: sp.get("market") ?? undefined,
    venue: sp.get("venue") ?? undefined,
    minProb: sp.get("minProb") ?? undefined,
    minEdge: sp.get("minEdge") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Neplatné pravidlo" }, { status: 400 });
  try {
    const data = process.env.RESOURCE_SAVING_READS_ENABLED === 'true'
      ? await readLegacyStats(parsed.data) : await computeLegacyStats(parsed.data);
    if (!data) return NextResponse.json({
      error: "Statistiky čekají na uložený souhrn.", asOf: null, stale: true, limitedReason: 'LEGACY_STATS_NOT_CAPTURED',
    }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' } });
    return NextResponse.json(data, { headers: data.stale ? { 'Cache-Control': 'no-store' } : publicCache(300, 900) });
  } catch (error) {
    logError("api/picks/stats", error);
    return NextResponse.json({ error: "Chyba statistik" }, { status: 502 });
  }
}
