import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { refreshUpcomingReferees } from "@/lib/data/refereeStore";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isRealDataConfigured()) return NextResponse.json({ error: "Mock režim" }, { status: 400 });
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const stats = await refreshUpcomingReferees();
    return cronJson("cron/refresh-referees", stats, 0, stats.updated);
  } catch (error) {
    logError("cron/refresh-referees", error);
    return NextResponse.json({ error: "Obnova rozhodčích selhala" }, { status: 502 });
  }
}
