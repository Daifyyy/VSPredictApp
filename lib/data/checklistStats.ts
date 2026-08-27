import { prisma } from "@/lib/db";
import { freshClosing } from "@/lib/picks/evaluation";

export interface ChecklistPerformance {
  version: number;
  candidates: number;
  settled: number;
  won: number;
  hitRate: number | null;
  pending: number;
  measuredClv: number;
  averageClv: number | null;
  positiveClvRate: number | null;
  priced: number;
  hypotheticalRoi: number | null;
}

export async function checklistPerformance(version = 1): Promise<ChecklistPerformance> {
  const candidates = await prisma.checklistDecisionSnapshot.findMany({
    where: { status: "candidate", checklistVersion: version },
    orderBy: { candidateAt: "asc" },
  });
  if (!candidates.length) return { version, candidates: 0, settled: 0, won: 0, hitRate: null, pending: 0, measuredClv: 0, averageClv: null, positiveClvRate: null, priced: 0, hypotheticalRoi: null };
  const fixtureIds = [...new Set(candidates.map((row) => row.fixtureId))];
  const [fixtures, signals] = await Promise.all([
    prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, status: true, homeGoals: true, awayGoals: true } }),
    prisma.marketSignalSnapshot.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, market: true, kickoff: true, closeMarketProbability: true, closedAt: true } }),
  ]);
  const fixtureById = new Map(fixtures.map((row) => [row.fixtureId, row]));
  const closeByKey = new Map(signals.map((row) => [`${row.fixtureId}:${row.market}`, freshClosing(row.kickoff, row.closedAt, row.closeMarketProbability).close]));
  let settled = 0;
  let won = 0;
  let priced = 0;
  let profit = 0;
  const clv: number[] = [];
  for (const row of candidates) {
    const fixture = fixtureById.get(row.fixtureId);
    if (fixture?.homeGoals != null && fixture.awayGoals != null) {
      let success = false;
      if (row.market === "1X2") {
        success = row.side === "HOME" ? fixture.homeGoals > fixture.awayGoals : row.side === "AWAY" ? fixture.awayGoals > fixture.homeGoals : fixture.homeGoals === fixture.awayGoals;
      } else if (row.market === "OVER_25") {
        success = row.side === "OVER" ? fixture.homeGoals + fixture.awayGoals > 2.5 : fixture.homeGoals + fixture.awayGoals < 2.5;
      } else continue;
      settled++;
      if (success) won++;
      if (row.decimalOdds != null) {
        priced++;
        profit += success ? row.decimalOdds - 1 : -1;
      }
    }
    const close = closeByKey.get(`${row.fixtureId}:${row.market}`);
    if (close != null) clv.push(close - row.marketProbability);
  }
  return {
    version,
    candidates: candidates.length,
    settled,
    won,
    hitRate: settled ? won / settled : null,
    pending: candidates.length - settled,
    measuredClv: clv.length,
    averageClv: clv.length ? clv.reduce((sum, value) => sum + value, 0) / clv.length : null,
    positiveClvRate: clv.length ? clv.filter((value) => value > 0).length / clv.length : null,
    priced,
    hypotheticalRoi: priced ? profit / priced : null,
  };
}
