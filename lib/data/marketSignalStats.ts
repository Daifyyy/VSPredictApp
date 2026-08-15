import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION, MARKET_SIGNAL_POLICY_VERSION } from "@/lib/picks/marketSignals";
import { RELIABLE_CLOSE_MAX_MINUTES } from "@/lib/picks/oddsSeries";

const activePolicyWhere: Prisma.MarketSignalSnapshotWhereInput = {
  OR: [
    { market: { in: ["1X2", "OVER_25"] }, policyVersion: MARKET_SIGNAL_POLICY_VERSION },
    { market: { in: ["CORNERS", "CARDS"] }, policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
  ],
};

export function effectiveClose(row: {
  kickoff: Date;
  closeMarketProbability: number | null;
  closedAt: Date | null;
  series: unknown;
}): { probability: number; minutesToKickoff: number } | null {
  const points = Array.isArray(row.series)
    ? row.series.filter((point): point is { t: number; p: number } =>
        typeof point === "object" && point !== null &&
        typeof (point as { t?: unknown }).t === "number" &&
        typeof (point as { p?: unknown }).p === "number" &&
        (point as { t: number }).t >= 0)
    : [];
  const latest = points.reduce<{ t: number; p: number } | null>(
    (best, point) => best == null || point.t < best.t ? point : best,
    null
  );
  if (latest && latest.t <= RELIABLE_CLOSE_MAX_MINUTES) {
    return { probability: latest.p, minutesToKickoff: latest.t };
  }
  if (row.closeMarketProbability == null || row.closedAt == null) return null;
  const minutes = (row.kickoff.getTime() - row.closedAt.getTime()) / 60_000;
  return minutes >= 0 && minutes <= RELIABLE_CLOSE_MAX_MINUTES
    ? { probability: row.closeMarketProbability, minutesToKickoff: minutes }
    : null;
}

export interface MarketClvSummary {
  market: string;
  context: string;
  publishedOnly: boolean;
  eligible: number;
  measured: number;
  completeness: number;
  averageClv: number;
  beatRate: number;
  averageModelVsOpen: number;
  averageModelVsClose: number;
}

export async function marketClvSummaries(): Promise<MarketClvSummary[]> {
  const rows = await prisma.marketSignalSnapshot.findMany({
    where: activePolicyWhere,
    select: {
      market: true,
      modelContext: true,
      publishedTip: true,
      modelProbability: true,
      openMarketProbability: true,
      closeMarketProbability: true,
      kickoff: true,
      closedAt: true,
      series: true,
    },
  });
  const cohorts: Array<{ market: string; context: string; publishedOnly: boolean }> = [];
  for (const row of rows) {
    const context = row.modelContext === "EURO_CUP" ? "EURO_CUP" : "LEAGUE";
    if (!cohorts.some((x) => x.market === row.market && x.context === context && !x.publishedOnly))
      cohorts.push({ market: row.market, context, publishedOnly: false });
    if (row.market === "1X2" && row.publishedTip && !cohorts.some((x) => x.market === row.market && x.context === context && x.publishedOnly))
      cohorts.push({ market: row.market, context, publishedOnly: true });
  }
  return cohorts.map((cohort) => {
    const all = rows.filter((row) => row.kickoff <= new Date() && row.market === cohort.market &&
      (row.modelContext === "EURO_CUP" ? "EURO_CUP" : "LEAGUE") === cohort.context &&
      (!cohort.publishedOnly || row.publishedTip));
    const measured = all.map((row) => ({ row, close: effectiveClose(row) })).filter((item) => item.close != null);
    const clv = measured.map(({ row, close }) => close!.probability - row.openMarketProbability);
    const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return {
      ...cohort,
      eligible: all.length,
      measured: measured.length,
      completeness: all.length ? measured.length / all.length : 0,
      averageClv: average(clv),
      beatRate: clv.length ? clv.filter((value) => value > 0).length / clv.length : 0,
      averageModelVsOpen: average(measured.map(({ row }) => row.modelProbability - row.openMarketProbability)),
      averageModelVsClose: average(measured.map(({ row, close }) => row.modelProbability - close!.probability)),
    };
  });
}

export interface MarketSignalHistoryOptions {
  market?: string;
  context?: string;
  leagueId?: number;
  direction?: "positive" | "negative";
  cursor?: string;
  limit: number;
}

export async function marketSignalHistory(options: MarketSignalHistoryOptions) {
  const rows = await prisma.marketSignalSnapshot.findMany({
    where: {
      AND: [activePolicyWhere],
      kickoff: { lt: new Date() },
      ...(options.market ? { market: options.market } : {}),
      ...(options.context ? { modelContext: options.context } : {}),
      ...(options.leagueId ? { leagueId: options.leagueId } : {}),
    },
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    orderBy: [{ kickoff: "desc" }, { id: "desc" }],
    take: options.limit + 1,
  });
  // Prisma neumí portable field-to-field filtr; záporný/kladný směr proto bezpečně filtrujeme
  // nad malou stránkou a nikdy kvůli tomu nečteme celou tabulku.
  const rowsWithClose = rows.map((row) => ({ row, close: effectiveClose(row) }));
  const directionRows = options.direction
    ? rowsWithClose.filter(({ row, close }) => close != null &&
        (options.direction === "positive"
          ? close.probability > row.openMarketProbability
          : close.probability < row.openMarketProbability))
    : rowsWithClose;
  const page = directionRows.slice(0, options.limit);
  const predictions = await prisma.fixturePrediction.findMany({
    where: { fixtureId: { in: page.map(({ row }) => row.fixtureId) } },
    select: { fixtureId: true, homeName: true, awayName: true, homeGoals: true, awayGoals: true, status: true, homeTeamId: true, awayTeamId: true },
  });
  const predictionById = new Map(predictions.map((row) => [row.fixtureId, row]));
  const stats = await prisma.matchStatCache.findMany({
    where: { fixtureId: { in: page.map(({ row }) => row.fixtureId) } },
    select: { fixtureId: true, corners: true, yellowCards: true, redCards: true },
  });
  const actual = new Map<number, { corners: number; cards: number }>();
  for (const stat of stats) {
    const value = actual.get(stat.fixtureId) ?? { corners: 0, cards: 0 };
    value.corners += stat.corners ?? 0;
    value.cards += (stat.yellowCards ?? 0) + (stat.redCards ?? 0);
    actual.set(stat.fixtureId, value);
  }
  return {
    rows: page.map(({ row, close }) => ({
      ...row,
      closeMarketProbability: close?.probability ?? null,
      closingMinutesToKickoff: close?.minutesToKickoff ?? null,
      prediction: predictionById.get(row.fixtureId) ?? null,
      actual: actual.get(row.fixtureId) ?? null,
      clv: close == null ? null : close.probability - row.openMarketProbability,
    })),
    nextCursor: directionRows.length > options.limit ? page.at(-1)?.row.id ?? null : null,
  };
}
