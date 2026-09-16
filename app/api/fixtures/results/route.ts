import { NextResponse } from "next/server";
import { getFixturesByDates } from "@/lib/data/repository";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { pragueDay } from "@/lib/data/fixtures";
import { getResultModelReviews, mergeResultModelReviews } from "@/lib/data/resultModelReviews";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Finalni snapshoty se doplni az po otevreni Vysledku, maximalne pro sedm dni. */
export async function GET(request: Request) {
  if (!allowRequest(`fixture-results:${clientKey(request)}`, 30, 60_000)) return tooMany();
  const today = pragueDay(new Date());
  const allowed = new Set(Array.from({ length: 7 }, (_, index) => shift(today, -(index + 1))));
  const dates = [...new Set((new URL(request.url).searchParams.get("dates") ?? "").split(","))]
    .filter((date) => DATE.test(date) && allowed.has(date))
    .slice(0, 7);
  if (!dates.length) return NextResponse.json({ error: "Chybi platne datum" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    const pro = user?.tier === "PRO" || isAdminEmail(user?.email);
    const days = await getFixturesByDates(dates);
    const fixtureIds = days.flatMap((day) => day.played.map((fixture) => fixture.fixtureId));
    const enriched = mergeResultModelReviews(days, await getResultModelReviews(fixtureIds, { pro }));
    return NextResponse.json({ days: enriched }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/fixtures/results", error, { dates });
    return NextResponse.json({ error: "Vysledky se nepodarilo obnovit" }, { status: 502 });
  }
}

function shift(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
