import { refreshClubElo } from "@/lib/data/clubEloStore";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { logError } from "@/lib/logError";
import { withCronRun } from "@/lib/operations";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied;
  try {
    const result = await withCronRun("refresh-elo", () => refreshClubElo());
    return cronJson("cron/refresh-elo", result, result.errors, result.processed);
  } catch (error) {
    logError("cron/refresh-elo", error);
    return Response.json({ ok: false, error: "Elo replay selhal" }, { status: 500 });
  }
}
