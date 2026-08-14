import { prisma } from "../lib/db";
import { Prisma } from "@prisma/client";
import { parseBooks } from "../lib/picks/books";
import { closeMarketSignals, openMarketSignals } from "../lib/data/marketSignalStore";
import { parseSeries, pointProbs } from "../lib/picks/oddsSeries";

async function main() {
  const rows = await prisma.fixturePrediction.findMany({
    where: { oddsBooks: { not: Prisma.DbNull } },
    select: { fixtureId: true, oddsBooks: true, oddsCloseBooks: true, oddsFetchedAt: true, oddsCloseAt: true, oddsSeries: true, oddsSeriesAt: true },
    orderBy: { kickoff: "asc" },
  });
  let opened = 0;
  let closed = 0;
  let restoredPoints = 0;
  for (const row of rows) {
    const openBooks = parseBooks(row.oddsBooks);
    if (!openBooks.length) continue;
    await openMarketSignals(row.fixtureId, openBooks, row.oddsFetchedAt ?? new Date());
    opened++;
    const legacy = parseSeries(row.oddsSeries);
    const signals = await prisma.marketSignalSnapshot.findMany({ where: { fixtureId: row.fixtureId } });
    for (const signal of signals) {
      const restored = legacy.flatMap((point) => {
        if (signal.market === "1X2") {
          const probabilities = pointProbs(point);
          if (!probabilities) return [];
          const side = signal.side.toLowerCase() as "home" | "draw" | "away";
          return [{ t: point.t, p: probabilities[side] }];
        }
        if (signal.market === "OVER_25" && point.o != null && point.u != null) {
          const total = 1 / point.o + 1 / point.u;
          const over = 1 / point.o / total;
          return [{ t: point.t, p: signal.side === "OVER" ? over : 1 - over }];
        }
        // Starý kompaktní formát průběžné linky rohů a karet neobsahoval.
        return [];
      });
      const current = Array.isArray(signal.series)
        ? signal.series.filter((point): point is { t: number; p: number } =>
            typeof point === "object" && point !== null &&
            typeof (point as { t?: unknown }).t === "number" &&
            typeof (point as { p?: unknown }).p === "number")
        : [];
      const merged = new Map<number, { t: number; p: number }>();
      for (const point of [...restored, ...current]) merged.set(point.t, point);
      const series = [...merged.values()].sort((a, b) => b.t - a.t).slice(-40);
      await prisma.marketSignalSnapshot.update({
        where: { id: signal.id },
        data: {
          series,
          sampleAttempts: Math.max(signal.sampleAttempts, legacy.length || 1),
          lastSampleAttemptAt: row.oddsSeriesAt ?? row.oddsFetchedAt ?? null,
        },
      });
      restoredPoints += Math.max(0, series.length - current.length);
    }
    const closeBooks = parseBooks(row.oddsCloseBooks);
    if (closeBooks.length) {
      await closeMarketSignals(row.fixtureId, closeBooks, row.oddsCloseAt ?? new Date());
      closed++;
    }
  }
  console.log(JSON.stringify({ rows: rows.length, opened, closed, restoredPoints }));
}

main().finally(() => prisma.$disconnect());
