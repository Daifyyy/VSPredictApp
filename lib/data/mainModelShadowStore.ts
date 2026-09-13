import "server-only";
import type { BookOdds } from "./apiFootball";
import { prisma } from "@/lib/db";
import { sharpFair } from "@/lib/picks/books";
import { MAIN_MODEL_SHADOW_METHOD, MAIN_MODEL_SHADOW_VERSION, marketResidualBaseline } from "@/lib/picks/mainModelShadow";

/** První dostupný předzápasový trh vytvoří neměnný v8 shadow snapshot. */
export async function captureMainModelShadow(fixtureId: number, books: BookOdds[], capturedAt: Date) {
  const market = sharpFair(books);
  if (!market) return false;
  const [source, elo] = await Promise.all([
    prisma.fixturePrediction.findUnique({ where: { fixtureId }, select: { fixtureId: true, kickoff: true, modelVersion: true, modelContext: true, contextVersion: true, available: true, homeWin: true, draw: true, awayWin: true } }),
    prisma.clubEloFixtureSnapshot.findFirst({ where: { fixtureId }, orderBy: { modelVersion: "desc" } }),
  ]);
  if (!source?.available || source.kickoff <= capturedAt) return false;
  const eloReady = elo && Math.min(elo.homeLongSample, elo.awayLongSample) >= 10 && Math.min(elo.homeFastSample, elo.awayFastSample) >= 5;
  const candidate = marketResidualBaseline({
    market: { home: market.home, draw: market.draw, away: market.away },
    source: { home: source.homeWin, draw: source.draw, away: source.awayWin },
    elo: eloReady ? { home: elo.homeProbability, draw: elo.drawProbability, away: elo.awayProbability } : null,
  });
  if (!candidate) return false;
  await prisma.mainModelShadowPrediction.upsert({
    where: { fixtureId_shadowVersion_method: { fixtureId, shadowVersion: MAIN_MODEL_SHADOW_VERSION, method: MAIN_MODEL_SHADOW_METHOD } },
    create: {
      fixtureId, shadowVersion: MAIN_MODEL_SHADOW_VERSION, sourceModelVersion: source.modelVersion, modelContext: source.modelContext, contextVersion: source.contextVersion,
      method: MAIN_MODEL_SHADOW_METHOD, kickoff: source.kickoff, capturedAt, bookmaker: market.bookmaker,
      marketHome: market.home, marketDraw: market.draw, marketAway: market.away,
      sourceHome: source.homeWin, sourceDraw: source.draw, sourceAway: source.awayWin,
      eloHome: eloReady ? elo.homeProbability : null, eloDraw: eloReady ? elo.drawProbability : null, eloAway: eloReady ? elo.awayProbability : null,
      homeProbability: candidate.probabilities.home, drawProbability: candidate.probabilities.draw, awayProbability: candidate.probabilities.away,
      marketWeight: candidate.weights.market, sourceWeight: candidate.weights.source, eloWeight: candidate.weights.elo,
      eloLongSample: eloReady ? Math.min(elo.homeLongSample, elo.awayLongSample) : null, eloFastSample: eloReady ? Math.min(elo.homeFastSample, elo.awayFastSample) : null,
    },
    update: {},
  });
  return true;
}
