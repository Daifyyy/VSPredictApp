import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { logError } from "@/lib/logError";
import { sendKickoffReminders } from "@/lib/push";

export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const stats = await sendKickoffReminders();
    return cronJson("cron/send-notifications", stats, stats.errors, stats.sent);
  } catch (error) {
    logError("cron/send-notifications", error);
    return NextResponse.json({ error: "Odesílání upozornění selhalo" }, { status: 502 });
  }
}
