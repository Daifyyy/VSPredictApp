import { NextResponse } from "next/server";
import { getFixturesByDates } from "@/lib/data/repository";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";
import { logError } from "@/lib/logError";
import { pragueDay } from "@/lib/data/fixtures";

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
    return NextResponse.json({ days: await getFixturesByDates(dates) }, { headers: publicCache(300, 86_400) });
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
