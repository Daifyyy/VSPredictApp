import { NextResponse } from "next/server";
import { runSettleResults } from "@/lib/data/predictions";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { withCronRun } from "@/lib/operations";

// Dotažení skutečných výsledků u odehraných predikcí (denní cron). Levné
// (batch /fixtures?ids=). Doplní goals/status → základ track-recordu a kalibrace.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isRealDataConfigured()) {
    return NextResponse.json(
      { error: "Reálná data nejsou nakonfigurována (mock režim)" },
      { status: 400 }
    );
  }
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const stats = await withCronRun("settle-results", async () => {
      const result = await runSettleResults();
      return {
        ...result,
        candidates: result.pending,
        processed: result.settled + result.statusUpdated,
        remaining: Math.max(0, result.pending - result.settled - result.statusUpdated),
      };
    });
    return cronJson("cron/settle-results", stats, stats.errors, stats.settled + stats.statusUpdated);
  } catch (e) {
    logError("cron/settle-results", e);
    return NextResponse.json({ error: "Settle selhal" }, { status: 502 });
  }
}
