import type { BookOdds } from "./apiFootball";
import { prisma } from "@/lib/db";
import { getPredictionByFixture } from "./predictionStore";
import {
  freezeMarketSignals,
  MARKET_SIGNAL_POLICY_VERSION,
  COUNT_MARKET_SIGNAL_POLICY_VERSION,
  TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION,
  marketSignalPolicyVersion,
  marketProbabilityAt,
  teamMarketProbabilityAtBookmaker,
} from "@/lib/picks/marketSignals";
import { isEuroCupLeague } from "./catalog";
import { referenceLineQuote } from "@/lib/picks/books";
import { PINNACLE_FIRST_BOOKMAKERS } from "./apiFootball";

const TEAM_MARKETS = ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] as const;

function immutableQuote(books: BookOdds[], market: string, line: number | null) {
  if (line == null || !market.startsWith("TEAM_")) return null;
  return referenceLineQuote(
    books,
    market.startsWith("TEAM_HOME") ? "totalHome" : "totalAway",
    line,
    "over",
    PINNACLE_FIRST_BOOKMAKERS
  );
}

export async function openMarketSignals(
  fixtureId: number,
  books: BookOdds[],
  at: Date,
  options: { includeCounts?: boolean; includeTeamGoals?: boolean } = {}
): Promise<void> {
  const row = await getPredictionByFixture(fixtureId);
  if (!row) return;
  const signals = freezeMarketSignals(row, books).filter((signal) =>
    (options.includeCounts !== false || (signal.market !== "CORNERS" && signal.market !== "CARDS")) &&
    (options.includeTeamGoals !== false || !signal.market.startsWith("TEAM_"))
  );
  await Promise.all(signals.map((signal) => prisma.marketSignalSnapshot.upsert({
    where: { fixtureId_market_policyVersion: { fixtureId, market: signal.market, policyVersion: marketSignalPolicyVersion(signal.market) } },
    create: (() => {
      const quote = immutableQuote(books, signal.market, signal.line);
      return {
      fixtureId,
      leagueId: row.leagueId,
      kickoff: new Date(row.kickoff),
      market: signal.market,
      side: signal.side,
      line: signal.line,
      modelProbability: signal.modelProbability,
      openMarketProbability: quote?.probability ?? signal.marketProbability,
      modelContext: row.modelContext ?? (isEuroCupLeague(row.leagueId) ? "EURO_CUP" : "LEAGUE"),
      modelVersion: row.modelVersion,
      contextVersion: row.contextVersion ?? 1,
      countModelVersion: signal.market === "CORNERS" || signal.market === "CARDS" ? row.countModelVersion : null,
      policyVersion: marketSignalPolicyVersion(signal.market),
      publishedTip: signal.publishedTip,
      openedAt: at,
      decimalOdds: quote?.odds ?? null,
      bookmaker: quote?.bookmaker ?? null,
      quotedAt: quote ? at : null,
      referenceOverround: quote?.overround ?? null,
      series: [{ t: Math.max(0, Math.round((new Date(row.kickoff).getTime() - at.getTime()) / 60_000)), p: quote?.probability ?? signal.marketProbability }],
      sampleAttempts: 0,
    }; })(),
    update: {},
  })));
}

export async function appendMarketSignalPoints(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  const rows = await prisma.marketSignalSnapshot.findMany({ where: { fixtureId, OR: [
    { market: { in: ["1X2", "OVER_25", "BTTS"] }, policyVersion: MARKET_SIGNAL_POLICY_VERSION },
    { market: { in: ["CORNERS", "CARDS"] }, policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
    { market: { in: [...TEAM_MARKETS] }, policyVersion: TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION },
  ] } });
  for (const row of rows) {
    const probability = row.market.startsWith("TEAM_")
      ? teamMarketProbabilityAtBookmaker(books, row.market as never, row.side as never, row.line, row.bookmaker)
      : marketProbabilityAt(books, row.market as never, row.side as never, row.line);
    if (probability == null) {
      await prisma.marketSignalSnapshot.update({
        where: { id: row.id },
        data: { sampleAttempts: { increment: 1 }, lastSampleAttemptAt: at },
      });
      continue;
    }
    const previous = Array.isArray(row.series) ? row.series as Array<{ t: number; p: number }> : [];
    const point = { t: Math.max(0, Math.round((row.kickoff.getTime() - at.getTime()) / 60_000)), p: probability };
    const series = [...previous.filter((item) => item.t > point.t), point].slice(-40);
    await prisma.marketSignalSnapshot.update({
      where: { id: row.id },
      data: { series, sampleAttempts: { increment: 1 }, lastSampleAttemptAt: at },
    });
  }
}

export async function closeMarketSignals(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  const rows = await prisma.marketSignalSnapshot.findMany({ where: { fixtureId, OR: [
    { market: { in: ["1X2", "OVER_25", "BTTS"] }, policyVersion: MARKET_SIGNAL_POLICY_VERSION },
    { market: { in: ["CORNERS", "CARDS"] }, policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
    { market: { in: [...TEAM_MARKETS] }, policyVersion: TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION },
  ] } });
  for (const row of rows) {
    const probability = row.market.startsWith("TEAM_")
      ? teamMarketProbabilityAtBookmaker(books, row.market as never, row.side as never, row.line, row.bookmaker)
      : marketProbabilityAt(books, row.market as never, row.side as never, row.line);
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
