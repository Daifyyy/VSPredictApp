import { prisma } from "../lib/db";
import { Prisma } from "@prisma/client";
import { parseBooks } from "../lib/picks/books";
import { closeMarketSignals, openMarketSignals } from "../lib/data/marketSignalStore";

async function main() {
  const rows = await prisma.fixturePrediction.findMany({
    where: { oddsBooks: { not: Prisma.DbNull } },
    select: { fixtureId: true, oddsBooks: true, oddsCloseBooks: true, oddsFetchedAt: true, oddsCloseAt: true },
    orderBy: { kickoff: "asc" },
  });
  let opened = 0;
  let closed = 0;
  for (const row of rows) {
    const openBooks = parseBooks(row.oddsBooks);
    if (!openBooks.length) continue;
    await openMarketSignals(row.fixtureId, openBooks, row.oddsFetchedAt ?? new Date());
    opened++;
    const closeBooks = parseBooks(row.oddsCloseBooks);
    if (closeBooks.length) {
      await closeMarketSignals(row.fixtureId, closeBooks, row.oddsCloseAt ?? new Date());
      closed++;
    }
  }
  console.log(JSON.stringify({ rows: rows.length, opened, closed }));
}

main().finally(() => prisma.$disconnect());
