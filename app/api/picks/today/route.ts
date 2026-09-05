import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/competitionGrouping";
import { pragueDateBounds } from "@/lib/recentWindow";
import { TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION } from "@/lib/picks/marketSignals";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
  const now = new Date();
  const bounds = pragueDateBounds(localDateKey(now));
  const [autonomous, research, manual] = await Promise.all([
    prisma.autonomousTipSnapshot.findMany({
      where: { status: "candidate", settlementStatus: "PENDING", kickoff: { gte: new Date(now.getTime() - 4 * 60 * 60_000), lt: bounds.end } },
      orderBy: { kickoff: "asc" }, take: 40,
      select: { id: true, fixtureId: true, strategy: true, market: true, side: true, line: true, homeName: true, awayName: true, kickoff: true, decimalOdds: true, bookmaker: true, capturedAt: true },
    }),
    prisma.marketSignalSnapshot.findMany({
      where: { policyVersion: TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION, market: { in: ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] }, kickoff: { gte: now, lt: bounds.end }, modelProbability: { gte: .6 } },
      orderBy: { kickoff: "asc" }, take: 40,
      select: { id: true, fixtureId: true, market: true, side: true, line: true, kickoff: true, modelProbability: true, openMarketProbability: true, decimalOdds: true, bookmaker: true, quotedAt: true },
    }),
    user.email ? prisma.userTip.findMany({
      where: { email: user.email, status: "NS", kickoff: { gte: new Date(now.getTime() - 4 * 60 * 60_000), lt: bounds.end } },
      orderBy: { kickoff: "asc" }, take: 40,
      select: { id: true, fixtureId: true, market: true, selection: true, line: true, homeName: true, awayName: true, kickoff: true, odds: true, oddsBook: true, oddsAt: true },
    }) : Promise.resolve([]),
  ]);
  const fixtureIds = [...new Set(research.map((row) => row.fixtureId))];
  const fixtures = fixtureIds.length ? await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, homeName: true, awayName: true } }) : [];
  const fixtureById = new Map(fixtures.map((row) => [row.fixtureId, row]));
  const rows = [
    ...autonomous.map((row) => ({ ...row, kind: "AUTONOMOUS" as const, label: row.strategy, probability: null, price: row.decimalOdds, priceTime: row.capturedAt })),
    ...research.map((row) => ({ ...row, kind: "RESEARCH" as const, label: "Týmové góly v2", homeName: fixtureById.get(row.fixtureId)?.homeName ?? "Domácí", awayName: fixtureById.get(row.fixtureId)?.awayName ?? "Hosté", probability: row.modelProbability, price: row.decimalOdds, priceTime: row.quotedAt })),
    ...manual.map((row) => ({ ...row, kind: "MANUAL" as const, label: "Můj tip", side: row.selection, homeName: row.homeName, awayName: row.awayName, probability: null, price: row.odds, bookmaker: row.oddsBook, priceTime: row.oddsAt })),
  ];
  const byFixture = new Map<number, typeof rows>();
  for (const row of rows) byFixture.set(row.fixtureId, [...(byFixture.get(row.fixtureId) ?? []), row]);
  const correlatedFixtures = [...byFixture.entries()].filter(([, items]) => new Set(items.map((item) => item.market)).size > 1).map(([fixtureId]) => fixtureId);
  return NextResponse.json({ rows, correlatedFixtures }, { headers: { "Cache-Control": "private, no-store" } });
}
