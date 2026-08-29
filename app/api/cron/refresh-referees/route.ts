import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { refreshUpcomingReferees } from "@/lib/data/refereeStore";
import { withCronRun } from "@/lib/operations";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isRealDataConfigured()) return NextResponse.json({ error: "Mock režim" }, { status: 400 });
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const params = new URL(req.url).searchParams;
    const limit = Number(params.get("limit") ?? 40);
    const stats = await withCronRun("refresh-referees", () =>
      refreshUpcomingReferees(new Date(), { limit, budgetMs: 42_000 })
    );
    return cronJson("cron/refresh-referees", stats, stats.errors, stats.processed);
  } catch (error) {
    logError("cron/refresh-referees", error);
    return NextResponse.json({ error: "Obnova rozhodčích selhala" }, { status: 502 });
  }
}
