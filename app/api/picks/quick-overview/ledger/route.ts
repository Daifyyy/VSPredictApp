import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { allowRequest, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { freshClosing } from "@/lib/picks/evaluation";
import { QUICK_BET_CATEGORIES } from "@/lib/picks/quickOverviewPerformance";
import { QUICK_OVERVIEW_POLICY_VERSION } from "@/lib/data/quickOverviewStore";
import { pragueDateBounds } from "@/lib/recentWindow";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  category: z.enum(QUICK_BET_CATEGORIES),
  context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE"),
  leagueId: z.coerce.number().int().positive().optional(),
  result: z.enum(["hit", "miss"]).optional(),
  clv: z.enum(["positive", "negative"]).optional(),
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
  if (!allowRequest(`quick-ledger:${user.id}`, 40, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný filtr" }, { status: 400 });
  const q = parsed.data;
  try {
    const dateRange = q.from || q.to ? { ...(q.from ? { gte: pragueDateBounds(q.from).start } : {}), ...(q.to ? { lt: pragueDateBounds(q.to).end } : {}) } : null;
    const scanLimit = q.clv ? Math.min(200, q.limit * 5) : q.limit;
    const rows = await prisma.quickOverviewSelection.findMany({
      where: {
        category: q.category, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, modelContext: q.context,
        ...(q.leagueId ? { leagueId: q.leagueId } : {}),
        ...(q.result ? { hit: q.result === "hit" } : {}),
        ...(dateRange ? { qualifiedAt: dateRange } : {}),
      },
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ qualifiedAt: "desc" }, { id: "desc" }], take: scanLimit + 1,
    });
    const predictions = await prisma.fixturePrediction.findMany({
      where: { fixtureId: { in: rows.map((row) => row.fixtureId) } },
      select: { fixtureId: true, leagueId: true, kickoff: true, homeName: true, awayName: true },
    });
    const byFixture = new Map(predictions.map((row) => [row.fixtureId, row]));
    const filtered = rows.filter((row) => byFixture.has(row.fixtureId)).filter((row) => {
      if (!q.clv) return true;
      const close = freshClosing(row.kickoff ?? byFixture.get(row.fixtureId)!.kickoff, row.closedAt, row.closingMarketProbability).close;
      if (close == null || row.marketProbability == null) return false;
      return q.clv === "positive" ? close > row.marketProbability : close <= row.marketProbability;
    });
    const page = filtered.slice(0, q.limit);
    const hasMoreFiltered = filtered.length > q.limit;
    const hasMoreScanned = rows.length > scanLimit;
    const continuation = hasMoreFiltered ? page.at(-1)?.id : hasMoreScanned ? rows[scanLimit - 1]?.id : null;
    return NextResponse.json({
      rows: page.map((row) => { const fixture = byFixture.get(row.fixtureId)!; const close = freshClosing(fixture.kickoff, row.closedAt, row.closingMarketProbability).close; return { ...row, kickoff: fixture.kickoff.toISOString(), qualifiedAt: row.qualifiedAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null, settledAt: row.settledAt?.toISOString() ?? null, leagueId: fixture.leagueId, homeName: fixture.homeName, awayName: fixture.awayName, freshClosingProbability: close, clv: close == null || row.marketProbability == null ? null : close - row.marketProbability }; }),
      nextCursor: continuation ?? null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/picks/quick-overview/ledger", error);
    return NextResponse.json({ error: "Historii rychlého přehledu se nepodařilo načíst" }, { status: 502 });
  }
}
