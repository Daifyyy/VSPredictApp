import type { BookOdds } from "./apiFootball";
import { prisma } from "@/lib/db";
import { getPredictionByFixture } from "./predictionStore";
import {
  freezeMarketSignals,
  MARKET_SIGNAL_POLICY_VERSION,
  marketProbabilityAt,
} from "@/lib/picks/marketSignals";
import { isEuroCupLeague } from "./catalog";

export async function openMarketSignals(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  const row = await getPredictionByFixture(fixtureId);
  if (!row) return;
  const signals = freezeMarketSignals(row, books);
  await Promise.all(signals.map((signal) => prisma.marketSignalSnapshot.upsert({
    where: { fixtureId_market_policyVersion: { fixtureId, market: signal.market, policyVersion: MARKET_SIGNAL_POLICY_VERSION } },
    create: {
      fixtureId,
      leagueId: row.leagueId,
      kickoff: new Date(row.kickoff),
      market: signal.market,
      side: signal.side,
      line: signal.line,
      modelProbability: signal.modelProbability,
      openMarketProbability: signal.marketProbability,
      modelContext: row.modelContext ?? (isEuroCupLeague(row.leagueId) ? "EURO_CUP" : "LEAGUE"),
      modelVersion: row.modelVersion,
      contextVersion: row.contextVersion ?? 1,
      countModelVersion: signal.market === "CORNERS" || signal.market === "CARDS" ? row.countModelVersion : null,
      policyVersion: MARKET_SIGNAL_POLICY_VERSION,
      publishedTip: signal.publishedTip,
      openedAt: at,
      series: [{ t: Math.max(0, Math.round((new Date(row.kickoff).getTime() - at.getTime()) / 60_000)), p: signal.marketProbability }],
    },
    update: {},
  })));
}

export async function appendMarketSignalPoints(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  const rows = await prisma.marketSignalSnapshot.findMany({ where: { fixtureId } });
  for (const row of rows) {
    const probability = marketProbabilityAt(books, row.market as never, row.side as never, row.line);
    if (probability == null) continue;
    const previous = Array.isArray(row.series) ? row.series as Array<{ t: number; p: number }> : [];
    const point = { t: Math.max(0, Math.round((row.kickoff.getTime() - at.getTime()) / 60_000)), p: probability };
    const series = [...previous.filter((item) => item.t > point.t), point].slice(-40);
    await prisma.marketSignalSnapshot.update({ where: { id: row.id }, data: { series } });
  }
}

export async function closeMarketSignals(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  const rows = await prisma.marketSignalSnapshot.findMany({ where: { fixtureId, closedAt: null } });
  for (const row of rows) {
    const probability = marketProbabilityAt(books, row.market as never, row.side as never, row.line);
    if (probability == null) continue;
    const previous = Array.isArray(row.series) ? row.series as Array<{ t: number; p: number }> : [];
    const point = { t: Math.max(0, Math.round((row.kickoff.getTime() - at.getTime()) / 60_000)), p: probability };
    await prisma.marketSignalSnapshot.update({
      where: { id: row.id },
      data: {
        closeMarketProbability: probability,
        closedAt: at,
        series: [...previous.filter((item) => item.t > point.t), point].slice(-40),
      },
    });
  }
}
