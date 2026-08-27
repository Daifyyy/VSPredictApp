import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { prisma } from "@/lib/db";
import { allowRequest, tooMany } from "@/lib/rateLimit";
import { summarizePortfolio } from "@/lib/picks/portfolioStats";
import { PUBLIC_CLUB_LEAGUE_IDS } from "@/lib/data/catalog";
import { logError } from "@/lib/logError";
import { binaryOutcome, freshClosing } from "@/lib/picks/evaluation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });
  if (user.tier !== "PRO") return NextResponse.json({ error: "Modelové portfolio je součástí PRO" }, { status: 403 });
  if (!allowRequest(`model-portfolio:${user.id}`, 30, 60_000)) return tooMany();
  const page = Math.max(1, Number(new URL(req.url).searchParams.get("page")) || 1);
  const take = 40;
  try {
    const [automatic, watches, checklist, legacy, total] = await Promise.all([
      prisma.autonomousTipSnapshot.findMany({ where: { status: "candidate" }, orderBy: { qualifiedAt: "desc" }, skip: (page - 1) * take, take }),
      prisma.autonomousTipSnapshot.findMany({ where: { status: { not: "candidate" }, kickoff: { gt: new Date() } }, orderBy: { kickoff: "asc" }, take: 60 }),
      prisma.checklistDecisionSnapshot.findMany({ where: { status: "candidate", checklistVersion: 1 }, orderBy: { candidateAt: "desc" } }),
      prisma.fixturePrediction.count({ where: { publicationPolicyVersion: 1, published1x2Side: { not: null } } }),
      prisma.autonomousTipSnapshot.count({ where: { status: "candidate" } }),
    ]);
    const fixtureIds = [...new Set([...automatic.map((x) => x.fixtureId), ...checklist.map((x) => x.fixtureId)])];
    const predictions = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, homeGoals: true, awayGoals: true, status: true, homeName: true, awayName: true, homeLogo: true, awayLogo: true, oddsCloseHome: true, oddsCloseAway: true, oddsCloseOver25: true, oddsCloseUnder25: true } });
    const byFixture = new Map(predictions.map((x) => [x.fixtureId, x]));
    const entries = automatic.map((row) => {
      const result = byFixture.get(row.fixtureId);
      const hit = binaryOutcome(row.market, row.side, result?.homeGoals ?? null, result?.awayGoals ?? null);
      return { ...row, qualifiedAt: row.qualifiedAt?.toISOString() ?? null, kickoff: row.kickoff.toISOString(), capturedAt: row.capturedAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null, hit, homeGoals: result?.homeGoals ?? null, awayGoals: result?.awayGoals ?? null };
    });
    const checklistEntries = [...checklist].reverse().map((row) => {
      const result = byFixture.get(row.fixtureId);
      const hit = binaryOutcome(row.market, row.side, result?.homeGoals ?? null, result?.awayGoals ?? null);
      return { strategy: "CHECKLIST", stake: 1, odds: row.decimalOdds, hit, marketProbability: row.marketProbability, closingMarketProbability: null };
    });
    const allForStats = await prisma.autonomousTipSnapshot.findMany({ where: { status: "candidate" }, orderBy: { qualifiedAt: "asc" } });
    const allIds = [...new Set(allForStats.map((x) => x.fixtureId))];
    const allResults = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: allIds } }, select: { fixtureId: true, homeGoals: true, awayGoals: true } });
    const results = new Map(allResults.map((x) => [x.fixtureId, x]));
    const statRows = allForStats.map((row) => ({ strategy: row.strategy, stake: row.stake, odds: row.decimalOdds, hit: binaryOutcome(row.market, row.side, results.get(row.fixtureId)?.homeGoals ?? null, results.get(row.fixtureId)?.awayGoals ?? null), marketProbability: row.marketProbability, closingMarketProbability: freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close, qualifiedAt: row.qualifiedAt }));
    const leagueRows = statRows.filter((_, index) => PUBLIC_CLUB_LEAGUE_IDS.includes(allForStats[index].leagueId as never));
    const europeanRows = statRows.filter((_, index) => allForStats[index].modelContext === "EURO_CUP");
    const strategies = ["ONE_X_TWO", "OVER_25", "BTTS_YES"].map((strategy) => ({ strategy, summary: summarizePortfolio(leagueRows.filter((row) => row.strategy === strategy)) }));
    const europeanStrategies = ["ONE_X_TWO", "OVER_25", "BTTS_YES"].map((strategy) => ({ strategy, summary: summarizePortfolio(europeanRows.filter((row) => row.strategy === strategy)) }));
    return NextResponse.json({ page, pages: Math.max(1, Math.ceil(total / take)), entries, watches: watches.map((row) => ({ ...row, kickoff: row.kickoff.toISOString(), capturedAt: row.capturedAt.toISOString(), qualifiedAt: null, closedAt: null })), summary: summarizePortfolio(leagueRows), strategies, european: { summary: summarizePortfolio(europeanRows), strategies: europeanStrategies }, checklist: summarizePortfolio(checklistEntries), legacy: { policyVersion: 1, total: legacy, status: "ukončeno" } });
  } catch (error) {
    logError("api/tips/model-portfolio", error);
    return NextResponse.json({ error: "Portfolio se nepodařilo načíst" }, { status: 502 });
  }
}
