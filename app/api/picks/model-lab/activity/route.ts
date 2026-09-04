import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { allowRequest, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { binaryOutcome, FINAL_STATUSES, freshClosing, portfolioProfit } from "@/lib/picks/evaluation";
import { splitModelLabActivity } from "@/lib/picks/modelLabActivity";
import { catalogLeagueName } from "@/lib/data/catalog";
import { pragueTwoDayStart } from "@/lib/recentWindow";

const querySchema = z.object({
  strategy: z.enum(["ONE_X_TWO", "OVER_25", "BTTS_YES", "TEAM_GOALS", "CORNERS", "CARDS_REF", "FOULS"]),
  context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE"),
  policyVersion: z.coerce.number().int().positive(),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
  if (!allowRequest(`model-lab-activity:${user.id}`, 50, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný filtr" }, { status: 400 });
  const { strategy, context, policyVersion } = parsed.data;
  if (!["ONE_X_TWO", "OVER_25", "BTTS_YES", "CORNERS"].includes(strategy)) {
    return NextResponse.json({ kind: strategy === "FOULS" ? "unavailable" : "research", current: [], recent: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const now = new Date();
    const rows = await prisma.autonomousTipSnapshot.findMany({
      where: { strategy, policyVersion, modelContext: context, status: "candidate", kickoff: { gte: pragueTwoDayStart(now) } },
      orderBy: { kickoff: "asc" },
      take: 100,
    });
    const results = rows.length ? await prisma.fixturePrediction.findMany({
      where: { fixtureId: { in: rows.map((row) => row.fixtureId) } },
      select: { fixtureId: true, homeGoals: true, awayGoals: true, status: true },
    }) : [];
    const byFixture = new Map(results.map((row) => [row.fixtureId, row]));
    const cornerStats = strategy === "CORNERS" && rows.length ? await prisma.matchStatCache.findMany({
      where: { fixtureId: { in: rows.map((row) => row.fixtureId) } },
      select: { fixtureId: true, teamId: true, corners: true },
    }) : [];
    const activityRows = rows.map((row) => {
      const result = byFixture.get(row.fixtureId);
      const homeCorners = cornerStats.find((item) => item.fixtureId === row.fixtureId && item.teamId === row.homeTeamId)?.corners;
      const awayCorners = cornerStats.find((item) => item.fixtureId === row.fixtureId && item.teamId === row.awayTeamId)?.corners;
      const actualCount = row.actualCount ?? (homeCorners != null && awayCorners != null ? homeCorners + awayCorners : null);
      const hit = row.hit ?? binaryOutcome(row.market, row.side, result?.homeGoals ?? null, result?.awayGoals ?? null, row.line, actualCount);
      const close = freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close;
      return {
        id: row.id,
        fixtureId: row.fixtureId,
        leagueId: row.leagueId,
        leagueName: catalogLeagueName(row.leagueId, `Soutěž ${row.leagueId}`),
        kickoff: row.kickoff,
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
        homeName: row.homeName,
        awayName: row.awayName,
        homeLogo: row.homeLogo,
        awayLogo: row.awayLogo,
        market: row.market,
        side: row.side,
        line: row.line,
        modelProbability: row.modelProbability,
        marketProbability: row.marketProbability,
        edge: row.edge,
        expectedValue: row.expectedValue,
        decimalOdds: row.decimalOdds,
        bookmaker: row.bookmaker,
        qualifiedAt: row.qualifiedAt,
        activityState: row.kickoff <= now ? "live" : "waiting",
        resultStatus: result?.status ?? null,
        homeGoals: result?.homeGoals ?? null,
        awayGoals: result?.awayGoals ?? null,
        actualCount,
        hit,
        final: FINAL_STATUSES.has(result?.status ?? ""),
        profit: portfolioProfit(hit, row.decimalOdds, row.stake),
        freshClosingProbability: close,
        clv: close == null ? null : close - row.marketProbability,
      };
    });
    const activity = splitModelLabActivity(activityRows, now);
    const serialize = (row: typeof activityRows[number]) => ({
      ...row,
      kickoff: row.kickoff.toISOString(),
      qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
    });
    return NextResponse.json({ kind: "autonomous", current: activity.current.map(serialize), recent: activity.recent.map(serialize) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/picks/model-lab/activity", error, { strategy, context });
    return NextResponse.json({ error: "Aktuální výběry se nepodařilo načíst" }, { status: 502 });
  }
}
