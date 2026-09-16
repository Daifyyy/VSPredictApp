import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { logError } from "@/lib/logError";
import { publishTelegramMorning } from "@/lib/telegram";
import { withCronRun } from "@/lib/operations";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const url = new URL(request.url);
  try {
    const result = await withCronRun("telegram-digest", async () => {
      const publication = await publishTelegramMorning(new Date(), { dryRun: url.searchParams.get("dryRun") === "1", force: url.searchParams.get("force") === "1" });
      const sent = "sent" in publication && Array.isArray(publication.sent) ? publication.sent.length : 0;
      const skipped = "skipped" in publication ? publication.skipped : null;
      return { ...publication, candidates: 3, processed: sent, errors: 0, reason: skipped };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("cron/telegram-digest", error);
    return NextResponse.json({ error: "Telegram přehled se nepodařilo připravit nebo odeslat." }, { status: 502 });
  }
}
