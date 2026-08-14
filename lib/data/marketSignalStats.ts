import { prisma } from "@/lib/db";

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
    select: {
      market: true,
      modelContext: true,
      publishedTip: true,
      modelProbability: true,
      openMarketProbability: true,
      closeMarketProbability: true,
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
    const all = rows.filter((row) => row.market === cohort.market &&
      (row.modelContext === "EURO_CUP" ? "EURO_CUP" : "LEAGUE") === cohort.context &&
      (!cohort.publishedOnly || row.publishedTip));
    const measured = all.filter((row) => row.closeMarketProbability != null);
    const clv = measured.map((row) => row.closeMarketProbability! - row.openMarketProbability);
    const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return {
      ...cohort,
      eligible: all.length,
      measured: measured.length,
      completeness: all.length ? measured.length / all.length : 0,
      averageClv: average(clv),
      beatRate: clv.length ? clv.filter((value) => value > 0).length / clv.length : 0,
      averageModelVsOpen: average(measured.map((row) => row.modelProbability - row.openMarketProbability)),
      averageModelVsClose: average(measured.map((row) => row.modelProbability - row.closeMarketProbability!)),
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
  const directionRows = options.direction
    ? rows.filter((row) => row.closeMarketProbability != null &&
        (options.direction === "positive"
          ? row.closeMarketProbability > row.openMarketProbability
          : row.closeMarketProbability < row.openMarketProbability))
    : rows;
  const page = directionRows.slice(0, options.limit);
  const predictions = await prisma.fixturePrediction.findMany({
    where: { fixtureId: { in: page.map((row) => row.fixtureId) } },
    select: { fixtureId: true, homeName: true, awayName: true, homeGoals: true, awayGoals: true, status: true, homeTeamId: true, awayTeamId: true },
  });
  const predictionById = new Map(predictions.map((row) => [row.fixtureId, row]));
  const stats = await prisma.matchStatCache.findMany({
    where: { fixtureId: { in: page.map((row) => row.fixtureId) } },
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
    rows: page.map((row) => ({
      ...row,
      prediction: predictionById.get(row.fixtureId) ?? null,
      actual: actual.get(row.fixtureId) ?? null,
      clv: row.closeMarketProbability == null ? null : row.closeMarketProbability - row.openMarketProbability,
    })),
    nextCursor: directionRows.length > options.limit ? page.at(-1)?.id ?? null : null,
  };
}
