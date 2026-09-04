import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { binaryOutcome, freshClosing } from "@/lib/picks/evaluation";
import { allowRequest, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

const querySchema = z.object({
  strategy: z.string().min(1).max(40),
  context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE"),
  policyVersion: z.coerce.number().int().positive().optional(),
  leagueId: z.coerce.number().int().positive().optional(),
  side: z.string().max(20).optional(),
  modelVersion: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
  if (!allowRequest(`model-lab-cohort:${user.id}`, 40, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatná kohorta" }, { status: 400 });
  const q = parsed.data;
  try {
    const rows = await prisma.autonomousTipSnapshot.findMany({
      where: { strategy: q.strategy, modelContext: q.context, status: "candidate", ...(q.policyVersion ? { policyVersion: q.policyVersion } : {}), ...(q.leagueId ? { leagueId: q.leagueId } : {}), ...(q.side ? { side: q.side } : {}), ...(q.modelVersion ? { modelVersion: q.modelVersion } : {}) },
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ kickoff: "desc" }, { id: "desc" }], take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const results = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: page.map((row) => row.fixtureId) } }, select: { fixtureId: true, homeGoals: true, awayGoals: true, status: true } });
    const byFixture = new Map(results.map((row) => [row.fixtureId, row]));
    const cornerRows = page.filter((row) => row.market === "CORNERS");
    const cornerStats = cornerRows.length ? await prisma.matchStatCache.findMany({ where: { fixtureId: { in: cornerRows.map((row) => row.fixtureId) } }, select: { fixtureId: true, teamId: true, corners: true } }) : [];
    return NextResponse.json({
      rows: page.map((row) => { const result = byFixture.get(row.fixtureId); const homeCorners = cornerStats.find((item) => item.fixtureId === row.fixtureId && item.teamId === row.homeTeamId)?.corners; const awayCorners = cornerStats.find((item) => item.fixtureId === row.fixtureId && item.teamId === row.awayTeamId)?.corners; const actualCount = row.actualCount ?? (homeCorners != null && awayCorners != null ? homeCorners + awayCorners : null); const hit = row.hit ?? binaryOutcome(row.market, row.side, result?.homeGoals ?? null, result?.awayGoals ?? null, row.line, actualCount); const close = freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close; return { ...row, kickoff: row.kickoff.toISOString(), qualifiedAt: row.qualifiedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null, homeGoals: result?.homeGoals ?? null, awayGoals: result?.awayGoals ?? null, actualCount, resultStatus: result?.status ?? null, hit, profit: row.profit ?? (hit == null || row.decimalOdds == null ? null : hit ? row.stake * (row.decimalOdds - 1) : -row.stake), freshClosingProbability: close, clv: close == null ? null : close - row.marketProbability }; }),
      nextCursor: rows.length > q.limit ? page.at(-1)?.id ?? null : null,
      cohort: q,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/picks/model-lab/cohort", error);
    return NextResponse.json({ error: "Kohortu se nepodařilo načíst" }, { status: 502 });
  }
}
