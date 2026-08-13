import { NextResponse } from "next/server";
import { getTodayFixtureSnapshot } from "@/lib/data/repository";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";
import { logError } from "@/lib/logError";

/** Dnešní Program + Výsledky se společnou 90s upstream cache. */
export async function GET(req: Request) {
  if (!allowRequest(`fixtoday:${clientKey(req)}`, 60, 60_000)) return tooMany();
  try {
    const day = await getTodayFixtureSnapshot();
    return NextResponse.json({ day }, { headers: publicCache(20, 40) });
  } catch (error) {
    logError("api/fixtures/today", error);
    return NextResponse.json({ error: "Dnešní zápasy se nepodařilo obnovit" }, { status: 502 });
  }
}
