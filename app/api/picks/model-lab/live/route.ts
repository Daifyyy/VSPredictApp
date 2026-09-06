import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const markets = ["LIVE_1X2", "LIVE_GOALS", "LIVE_BTTS"] as const;
const labels: Record<(typeof markets)[number], string> = { LIVE_1X2: "Live 1X2 v1", LIVE_GOALS: "Live góly v1", LIVE_BTTS: "Live BTTS v1" };

function summarize(rows: Array<{ hit: boolean | null; profit: number | null; modelProbability: number; minute: number }>) {
  const settled = rows.filter((row) => row.hit != null && row.profit != null);
  const profit = settled.reduce((sum, row) => sum + row.profit!, 0);
  let peak = 0, balance = 0, maxDrawdown = 0;
  for (const row of settled) { balance += row.profit!; peak = Math.max(peak, balance); maxDrawdown = Math.max(maxDrawdown, peak - balance); }
  const brier = settled.length ? settled.reduce((sum, row) => sum + (row.modelProbability - (row.hit ? 1 : 0)) ** 2, 0) / settled.length : null;
  const bands = [[15, 30], [31, 45], [46, 60], [61, 80]].map(([from, to]) => {
    const band = settled.filter((row) => row.minute >= from && row.minute <= to);
    return { label: `${from}–${to}. minuta`, sample: band.length, roi: band.length ? band.reduce((sum, row) => sum + row.profit!, 0) / band.length : null };
  });
  return { sample: settled.length, hits: settled.filter((row) => row.hit).length, profit, roi: settled.length ? profit / settled.length : null, brier, maxDrawdown, priceCompleteness: rows.length ? 1 : null, bands };
}

export async function GET(request: Request) {
  if (!allowRequest(`model-lab-live:${clientKey(request)}`, 30, 60_000)) return tooMany();
  try {
    const detail = new URL(request.url).searchParams.get("detail") === "true";
    const user = detail ? await getCurrentUser() : null;
    if (detail && !getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
    const rows = await prisma.liveCandidateSnapshot.findMany({ orderBy: { qualifiedAt: "asc" }, select: { id: true, fixtureId: true, homeName: true, awayName: true, kickoff: true, market: true, side: true, line: true, minute: true, scoreHome: true, scoreAway: true, modelProbability: true, marketProbability: true, expectedValue: true, decimalOdds: true, bookmaker: true, qualifiedAt: true, settlementStatus: true, hit: true, profit: true } });
    const cards = markets.map((market) => {
      const own = rows.filter((row) => row.market === market);
      return { market, title: labels[market], status: "LIVE_TEST", currentCount: own.filter((row) => row.settlementStatus === "PENDING").length, ...summarize(own), ...(detail ? { current: own.filter((row) => row.settlementStatus === "PENDING"), recent: own.filter((row) => row.settlementStatus !== "PENDING").slice(-20).reverse() } : {}) };
    });
    return NextResponse.json({ cards }, { headers: { "Cache-Control": detail ? "private, no-store" : "public, s-maxage=120, stale-while-revalidate=300" } });
  } catch (error) {
    logError("api/picks/model-lab/live", error);
    return NextResponse.json({ error: "Live modely se nepodařilo načíst" }, { status: 502 });
  }
}
