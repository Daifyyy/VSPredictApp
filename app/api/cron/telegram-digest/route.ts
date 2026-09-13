import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { logError } from "@/lib/logError";
import { publishTelegramMorning } from "@/lib/telegram";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const url = new URL(request.url);
  try {
    const result = await publishTelegramMorning(new Date(), { dryRun: url.searchParams.get("dryRun") === "1", force: url.searchParams.get("force") === "1" });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("cron/telegram-digest", error);
    return NextResponse.json({ error: "Telegram přehled se nepodařilo připravit nebo odeslat." }, { status: 502 });
  }
}
