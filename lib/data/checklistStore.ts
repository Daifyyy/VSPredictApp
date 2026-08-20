import type { BookOdds } from "./apiFootball";
import { prisma } from "@/lib/db";
import { bestLinePrice, bestPrice } from "@/lib/picks/books";
import { DECISION_CHECKLIST_VERSION, evaluateDecisionSignal } from "@/lib/picks/decisionChecklist";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION, MARKET_SIGNAL_POLICY_VERSION, marketProbabilityAt, type SignalMarket, type SignalSide } from "@/lib/picks/marketSignals";

export interface NewChecklistCandidate {
  fixtureId: number;
  leagueId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  market: string;
  side: string;
  line: number | null;
  modelProbability: number;
  marketProbability: number;
  edge: number;
  sampleCount: number;
}

function priceFor(books: BookOdds[], market: SignalMarket, side: SignalSide, line: number | null) {
  if (market === "1X2") return bestPrice(books, side === "HOME" ? "home" : side === "DRAW" ? "draw" : "away");
  if (market === "OVER_25") return bestPrice(books, side === "OVER" ? "over25" : "under25");
  if (line == null) return null;
  return bestLinePrice(books, market === "CORNERS" ? "corners" : "cards", line, side === "OVER" ? "over" : "under");
}

/** Vyhodnotí právě uložený kurzový bod. Nevolá upstream API a kandidáta nikdy nepřepíše. */
export async function captureChecklistDecisions(
  fixtureId: number,
  books: BookOdds[],
  at: Date
): Promise<NewChecklistCandidate[]> {
  const prediction = await prisma.fixturePrediction.findUnique({ where: { fixtureId } });
  if (!prediction || prediction.kickoff <= at || prediction.kickoff.getTime() - at.getTime() < 15 * 60_000) return [];
  const signals = await prisma.marketSignalSnapshot.findMany({
    where: { fixtureId, OR: [
      { market: { in: ["1X2", "OVER_25"] }, policyVersion: MARKET_SIGNAL_POLICY_VERSION },
      { market: { in: ["CORNERS", "CARDS"] }, policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
    ] },
  });
  const created: NewChecklistCandidate[] = [];
  for (const signal of signals) {
    const market = signal.market as SignalMarket;
    const side = signal.side as SignalSide;
    const current = marketProbabilityAt(books, market, side, signal.line);
    if (current == null) continue;
    const points = Array.isArray(signal.series) ? signal.series : [];
    const samples = points.length;
    const currentMove = current - signal.openMarketProbability;
    const decision = evaluateDecisionSignal({
      market,
      modelContext: prediction.modelContext,
      lowConfidence: prediction.lowConfidence,
      readinessSample: prediction.readinessSample,
      modelProbability: signal.modelProbability,
      marketProbability: current,
      samples,
      currentMove,
    });
    const existing = await prisma.checklistDecisionSnapshot.findUnique({
      where: { fixtureId_market_checklistVersion: { fixtureId, market, checklistVersion: DECISION_CHECKLIST_VERSION } },
    });
    if (existing?.status === "candidate") continue;
    const price = priceFor(books, market, side, signal.line);
    const data = {
      leagueId: prediction.leagueId,
      kickoff: prediction.kickoff,
      side,
      line: signal.line,
      status: decision.status,
      reason: decision.reason,
      modelProbability: signal.modelProbability,
      marketProbability: current,
      edge: signal.modelProbability - current,
      decimalOdds: price?.odds ?? null,
      bookmaker: price?.bookmaker ?? null,
      sampleCount: samples,
      modelContext: prediction.modelContext,
      modelVersion: prediction.modelVersion,
      contextVersion: prediction.contextVersion,
      capturedAt: at,
      candidateAt: decision.status === "candidate" ? at : null,
    };
    await prisma.checklistDecisionSnapshot.upsert({
      where: { fixtureId_market_checklistVersion: { fixtureId, market, checklistVersion: DECISION_CHECKLIST_VERSION } },
      create: { fixtureId, market, checklistVersion: DECISION_CHECKLIST_VERSION, ...data },
      update: data,
    });
    if (decision.status === "candidate") created.push({
      fixtureId,
      leagueId: prediction.leagueId,
      homeTeamId: prediction.homeTeamId,
      awayTeamId: prediction.awayTeamId,
      homeName: prediction.homeName,
      awayName: prediction.awayName,
      market,
      side,
      line: signal.line,
      modelProbability: signal.modelProbability,
      marketProbability: current,
      edge: signal.modelProbability - current,
      sampleCount: samples,
    });
  }
  return created;
}
