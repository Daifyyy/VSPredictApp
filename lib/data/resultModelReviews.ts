import "server-only";
import { isRealDataConfigured, prisma } from "@/lib/db";
import type { FixtureDay, ModelReviewChip, PlayedModelReview } from "@/lib/types";
import { binaryOutcome, countTone, freshClosing, portfolioProfit } from "@/lib/picks/evaluation";

const pct = (value: number) => `${Math.round(value * 100)} %`;
const one = (value: number) => value.toFixed(1).replace(".", ",");

export async function getResultModelReviews(fixtureIds: number[]): Promise<Map<number, PlayedModelReview>> {
  // Offline/mock E2E must be hermetic. Model reviews are an optional enrichment;
  // reaching a configured production DATABASE_URL from DATA_SOURCE=mock made UI
  // tests flaky and could accidentally read production data from a preview run.
  if (!isRealDataConfigured()) return new Map();
  const ids = [...new Set(fixtureIds)];
  if (!ids.length) return new Map();
  const [predictions, stats, selections, signals] = await Promise.all([
    prisma.fixturePrediction.findMany({ where: { fixtureId: { in: ids } } }),
    prisma.matchStatCache.findMany({ where: { fixtureId: { in: ids } }, select: { fixtureId: true, teamId: true, context: true, corners: true, fouls: true, yellowCards: true, redCards: true } }),
    prisma.autonomousTipSnapshot.findMany({ where: { fixtureId: { in: ids }, status: "candidate" } }),
    prisma.marketSignalSnapshot.findMany({ where: { fixtureId: { in: ids } }, orderBy: { openedAt: "asc" } }),
  ]);
  const statMap = new Map<number, typeof stats>();
  for (const row of stats) statMap.set(row.fixtureId, [...(statMap.get(row.fixtureId) ?? []), row]);
  const selectionMap = new Map<number, typeof selections>();
  for (const row of selections) selectionMap.set(row.fixtureId, [...(selectionMap.get(row.fixtureId) ?? []), row]);
  const signalMap = new Map<number, typeof signals>();
  for (const row of signals) signalMap.set(row.fixtureId, [...(signalMap.get(row.fixtureId) ?? []), row]);
  const reviews = new Map<number, PlayedModelReview>();
  for (const p of predictions) {
    if (!p.available || p.homeGoals == null || p.awayGoals == null) continue;
    const actualOutcome = p.homeGoals > p.awayGoals ? "HOME" : p.awayGoals > p.homeGoals ? "AWAY" : "DRAW";
    const predicted: Array<["HOME" | "DRAW" | "AWAY", number]> = [["HOME", p.homeWin], ["DRAW", p.draw], ["AWAY", p.awayWin]];
    predicted.sort((a, b) => b[1] - a[1]);
    const actualStats = statMap.get(p.fixtureId) ?? [];
    // Cache může obsahovat více modelových kontextů; každý tým se smí započítat právě jednou.
    const uniqueStats = [...new Map(actualStats.map((row) => [row.teamId, row])).values()];
    const sum = (field: "corners" | "fouls") => uniqueStats.some((x) => x[field] != null) ? uniqueStats.reduce((n, x) => n + (x[field] ?? 0), 0) : null;
    const actualCards = uniqueStats.some((x) => x.yellowCards != null || x.redCards != null)
      ? uniqueStats.reduce((n, x) => n + (x.yellowCards ?? 0) + (x.redCards ?? 0), 0) : null;
    const expectedCorners = p.lambdaCornersHome != null && p.lambdaCornersAway != null ? p.lambdaCornersHome + p.lambdaCornersAway : null;
    const expectedCards = p.lambdaCardsHome != null && p.lambdaCardsAway != null ? p.lambdaCardsHome + p.lambdaCardsAway : null;
    const expectedFouls = p.lambdaFoulsHome != null && p.lambdaFoulsAway != null ? p.lambdaFoulsHome + p.lambdaFoulsAway : null;
    const actualCorners = sum("corners"), actualFouls = sum("fouls");
    const count = (expected: number | null, actual: number | null) => ({ expected, actual, error: expected == null || actual == null ? null : Math.abs(expected - actual) });
    const corners = count(expectedCorners, actualCorners), cards = count(expectedCards, actualCards), fouls = count(expectedFouls, actualFouls);
    const overHit = p.homeGoals + p.awayGoals > 2.5;
    const bttsHit = p.homeGoals > 0 && p.awayGoals > 0;
    const chips: ModelReviewChip[] = [
      { market: "1X2", label: "Prognóza · 1X2", value: `${predicted[0][0] === "HOME" ? "domácí" : predicted[0][0] === "AWAY" ? "hosté" : "remíza"} ${pct(predicted[0][1])}`, result: predicted[0][0] === actualOutcome ? "vyšlo" : "nevyšlo", tone: predicted[0][0] === actualOutcome ? "positive" : "negative" },
      { market: "OVER_25", label: "Prognóza · Over 2,5", value: pct(p.over25), result: `${p.homeGoals + p.awayGoals} góly`, tone: (p.over25 >= .5) === overHit ? "positive" : "negative" },
      { market: "BTTS", label: "Prognóza · BTTS Ano", value: pct(p.bttsYes), result: bttsHit ? "vyšlo" : "nevyšlo", tone: (p.bttsYes >= .5) === bttsHit ? "positive" : "negative" },
    ];
    for (const [market, label, item] of [["CORNERS", "Rohy", corners], ["CARDS", "Karty", cards], ["FOULS", "Fauly", fouls]] as const) {
      if (item.expected != null) chips.push({ market, label: `Prognóza · ${label}`, value: `model ${one(item.expected)}`, result: item.actual == null ? "skutečnost —" : `skutečnost ${one(item.actual)}`, tone: countTone(item.error) });
    }
    const market = (signalMap.get(p.fixtureId) ?? []).map((signal) => {
      const close = freshClosing(signal.kickoff, signal.closedAt, signal.closeMarketProbability);
      return { market: signal.market, side: signal.side, line: signal.line, open: signal.openMarketProbability, close: close.close, movement: close.close == null ? null : close.close - signal.openMarketProbability, freshClose: close.fresh };
    });
    const portfolio = (selectionMap.get(p.fixtureId) ?? []).map((row) => {
      const hit = binaryOutcome(row.market, row.side, p.homeGoals, p.awayGoals);
      return { strategy: row.strategy, side: row.side, odds: row.decimalOdds, hit, profit: portfolioProfit(hit, row.decimalOdds, row.stake), policyVersion: row.policyVersion };
    });
    reviews.set(p.fixtureId, { chips, probabilities: { home: p.homeWin, draw: p.draw, away: p.awayWin, over25: p.over25, bttsYes: p.bttsYes }, expectedScore: { home: p.lambdaHome, away: p.lambdaAway }, counts: { corners, cards, fouls }, modelVersion: p.modelVersion, countModelVersion: p.countModelVersion, foulModelVersion: p.foulModelVersion, context: p.modelContext, readinessSample: p.readinessSample, lowConfidence: p.lowConfidence, referee: { name: p.refereeName, factor: p.refereeFactor, sample: p.refereeSample }, market, portfolio });
  }
  return reviews;
}

export function mergeResultModelReviews(days: FixtureDay[], reviews: Map<number, PlayedModelReview>): FixtureDay[] {
  if (!reviews.size) return days;
  return days.map((day) => ({ ...day, played: day.played.map((fixture) => ({ ...fixture, modelReview: reviews.get(fixture.fixtureId) })) }));
}
