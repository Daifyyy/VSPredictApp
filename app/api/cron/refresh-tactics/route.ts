import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { backfillRecentTactics } from "@/lib/data/tacticsBackfill";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isRealDataConfigured()) return NextResponse.json({ error: "Mock režim" }, { status: 400 });
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const stats = await backfillRecentTactics(30);
    return cronJson("cron/refresh-tactics", stats, stats.errors, stats.savedRows);
  } catch (error) {
    logError("cron/refresh-tactics", error);
    return NextResponse.json({ error: "Obnova taktických sestav selhala" }, { status: 502 });
  }
}
