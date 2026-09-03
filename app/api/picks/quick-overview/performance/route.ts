import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";
import { logError } from "@/lib/logError";
import { QUICK_BET_CATEGORIES, quickOverviewSummary } from "@/lib/picks/quickOverviewPerformance";
import { QUICK_OVERVIEW_POLICY_VERSION } from "@/lib/data/quickOverviewStore";

const querySchema = z.object({ context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE") });
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`quick-performance:${clientKey(request)}`, 40, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný kontext" }, { status: 400 });
  try {
    const rows = await prisma.quickOverviewSelection.findMany({
      where: { policyVersion: QUICK_OVERVIEW_POLICY_VERSION, category: { in: [...QUICK_BET_CATEGORIES] }, modelContext: parsed.data.context },
      orderBy: { qualifiedAt: "asc" },
    });
    const cards = QUICK_BET_CATEGORIES.map((category) => {
      const categoryRows = rows.filter((row) => row.category === category && row.kickoff != null).map((row) => ({ ...row, kickoff: row.kickoff! }));
      return { category, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, summary: quickOverviewSummary(categoryRows) };
    });
    return NextResponse.json({ context: parsed.data.context, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, cards }, { headers: publicCache(300, 900) });
  } catch (error) {
    logError("api/picks/quick-overview/performance", error);
    return NextResponse.json({ error: "Výkonnost rychlého přehledu se nepodařilo načíst" }, { status: 502 });
  }
}
