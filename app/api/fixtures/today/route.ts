import { NextResponse } from "next/server";
import { getTodayFixtureSnapshot } from "@/lib/data/repository";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";
import { logError } from "@/lib/logError";
import { requestDiagnostics } from "@/lib/httpDiagnostics";

/** Dnešní Program + Výsledky se sdílenou 15min upstream cache. Live skóre má vlastní cestu. */
export async function GET(req: Request) {
  const diagnostic = requestDiagnostics(req);
  if (!allowRequest(`fixtoday:${clientKey(req)}`, 60, 60_000)) return tooMany();
  try {
    const day = await getTodayFixtureSnapshot();
    return diagnostic.json({ day }, { headers: publicCache(60, 300) });
  } catch (error) {
    logError("api/fixtures/today", error);
    return NextResponse.json({ error: "Dnešní zápasy se nepodařilo obnovit" }, { status: 502 });
  }
}
