import type { BookOdds } from "./apiFootball";
import { PINNACLE_FIRST_BOOKMAKERS } from "./apiFootball";
import { prisma } from "@/lib/db";
import { sharpFair, sharpFairTotal } from "@/lib/picks/books";
import { referenceLineQuote } from "@/lib/picks/books";
import { AUTONOMOUS_POLICY_VERSION, CORNERS_LIVE_COUNT_MODEL_VERSION, evaluateAutonomousTip, type AutonomousStrategy } from "@/lib/picks/autonomousPortfolio";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION, MARKET_SIGNAL_POLICY_VERSION, marketProbabilityAt } from "@/lib/picks/marketSignals";
import { isPublicClubLeague } from "./catalog";
import { binaryOutcome, portfolioProfit, RELIABLE_CLOSE_MAX_MINUTES } from "@/lib/picks/evaluation";

let cornerActivationCache: { modelVersion: number; enabled: boolean; expiresAt: number } | null = null;

async function cornersLiveEnabled(modelVersion: number, at: Date): Promise<boolean> {
  if (cornerActivationCache?.modelVersion === modelVersion && cornerActivationCache.expiresAt > at.getTime()) return cornerActivationCache.enabled;
  const definition = await prisma.modelStrategyDefinition.findUnique({
    where: { strategy_policyVersion_modelContext_modelVersion: { strategy: "CORNERS", policyVersion: AUTONOMOUS_POLICY_VERSION.CORNERS, modelContext: "LEAGUE", modelVersion } },
    select: { status: true, startedAt: true },
  });
  const enabled = definition?.status === "LIVE_TEST" && definition.startedAt <= at;
  cornerActivationCache = { modelVersion, enabled, expiresAt: at.getTime() + 60_000 };
  return enabled;
}

type Side = "HOME" | "AWAY" | "OVER" | "UNDER";

function referenceBook(books: BookOdds[], strategy: AutonomousStrategy): { odds: number; bookmaker: string } | null {
  const field = strategy === "ONE_X_TWO" ? null : strategy === "OVER_25" ? "over25" : "btts";
  const ordered = [...books].sort((a, b) => {
    const ai = PINNACLE_FIRST_BOOKMAKERS.indexOf(a.id);
    const bi = PINNACLE_FIRST_BOOKMAKERS.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  for (const book of ordered) {
    const value = field == null ? null : book[field];
    if (value != null && value > 1) return { odds: value, bookmaker: book.name };
  }
  return null;
}

function referenceOneXTwo(books: BookOdds[], side: "HOME" | "AWAY") {
  const ordered = [...books].sort((a, b) => {
    const ai = PINNACLE_FIRST_BOOKMAKERS.indexOf(a.id);
    const bi = PINNACLE_FIRST_BOOKMAKERS.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  for (const book of ordered) {
    const value = side === "HOME" ? book.home : book.away;
    if (value != null && value > 1) return { odds: value, bookmaker: book.name };
  }
  return null;
}

/** Aktualizuje sledovane signaly; jakmile se z nich stane kandidat, radek uz je nemenny. */
export async function captureAutonomousPortfolio(fixtureId: number, books: BookOdds[], at: Date): Promise<number> {
  const prediction = await prisma.fixturePrediction.findUnique({ where: { fixtureId } });
  if (!prediction || prediction.kickoff <= at) return 0;
  const minutesToKickoff = (prediction.kickoff.getTime() - at.getTime()) / 60_000;
  const signals = await prisma.marketSignalSnapshot.findMany({
    where: { fixtureId, OR: [
      { market: { in: ["1X2", "OVER_25", "BTTS"] }, policyVersion: MARKET_SIGNAL_POLICY_VERSION },
      { market: "CORNERS", policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
    ] },
  });
  const byMarket = new Map(signals.map((signal) => [signal.market, signal]));
  const oneSide: Side = prediction.homeWin >= prediction.awayWin ? "HOME" : "AWAY";
  const oneProb = oneSide === "HOME" ? prediction.homeWin : prediction.awayWin;
  const oneFair = sharpFair(books);
  const totalFair = sharpFairTotal(books);
  let bttsFair: { yes: number; no: number; overround: number } | null = null;
  for (const book of books) {
    if (book.btts == null || book.bttsNo == null) continue;
    const sum = 1 / book.btts + 1 / book.bttsNo;
    const candidate = { yes: 1 / book.btts / sum, no: 1 / book.bttsNo / sum, overround: sum - 1 };
    if (!bttsFair || candidate.overround < bttsFair.overround) bttsFair = candidate;
  }
  const cornerSignal = byMarket.get("CORNERS");
  const cornerEnabled = await cornersLiveEnabled(prediction.modelVersion, at);
  const cornerSide = cornerSignal?.side === "UNDER" ? "UNDER" : "OVER";
  const cornerQuote = cornerSignal?.line == null ? null : referenceLineQuote(books, "corners", cornerSignal.line, cornerSide === "OVER" ? "over" : "under", PINNACLE_FIRST_BOOKMAKERS);
  const inputs: Array<{ strategy: AutonomousStrategy; market: string; side: Side; line: number | null; probability: number; marketProbability: number | null; second?: number; price: { odds: number; bookmaker: string } | null; samples: number; overround?: number | null; countModelVersion?: number | null }> = [
    { strategy: "ONE_X_TWO", market: "1X2", side: oneSide, line: null, probability: oneProb, marketProbability: oneFair ? (oneSide === "HOME" ? oneFair.home : oneFair.away) : null, second: Math.max(prediction.draw, oneSide === "HOME" ? prediction.awayWin : prediction.homeWin), price: referenceOneXTwo(books, oneSide), samples: Array.isArray(byMarket.get("1X2")?.series) ? (byMarket.get("1X2")!.series as unknown[]).length : 0, overround: oneFair?.overround },
    { strategy: "OVER_25", market: "OVER_25", side: "OVER", line: 2.5, probability: prediction.over25, marketProbability: totalFair?.over25 ?? null, price: referenceBook(books, "OVER_25"), samples: Array.isArray(byMarket.get("OVER_25")?.series) ? (byMarket.get("OVER_25")!.series as unknown[]).length : 0, overround: totalFair?.overround },
    { strategy: "BTTS_YES", market: "BTTS", side: "OVER", line: null, probability: prediction.bttsYes, marketProbability: bttsFair?.yes ?? null, price: referenceBook(books, "BTTS_YES"), samples: Array.isArray(byMarket.get("BTTS")?.series) ? (byMarket.get("BTTS")!.series as unknown[]).length : 0, overround: bttsFair?.overround },
    ...(cornerEnabled && isPublicClubLeague(prediction.leagueId) && prediction.modelContext === "LEAGUE" && prediction.countModelVersion === CORNERS_LIVE_COUNT_MODEL_VERSION && cornerSignal?.countModelVersion === CORNERS_LIVE_COUNT_MODEL_VERSION && cornerSignal?.line != null && Math.abs(cornerSignal.line % 1) === 0.5 && cornerQuote
      ? [{ strategy: "CORNERS" as const, market: "CORNERS", side: cornerSide as Side, line: cornerSignal.line, probability: cornerSignal.modelProbability, marketProbability: cornerQuote.probability, price: { odds: cornerQuote.odds, bookmaker: cornerQuote.bookmaker }, samples: Array.isArray(cornerSignal.series) ? (cornerSignal.series as unknown[]).length : 0, overround: cornerQuote.overround, countModelVersion: prediction.countModelVersion }]
      : []),
  ];
  let created = 0;
  for (const input of inputs) {
    if (input.marketProbability == null) continue;
    const version = AUTONOMOUS_POLICY_VERSION[input.strategy];
    const existing = await prisma.autonomousTipSnapshot.findUnique({
      where: { fixtureId_strategy_policyVersion: { fixtureId, strategy: input.strategy, policyVersion: version } },
    });
    if (existing?.status === "candidate") continue;
    const decision = evaluateAutonomousTip({
      strategy: input.strategy,
      modelProbability: input.probability,
      marketProbability: input.marketProbability,
      decimalOdds: input.price?.odds ?? null,
      secondProbability: input.second,
      readinessSample: prediction.readinessSample,
      lowConfidence: prediction.lowConfidence,
      sampleCount: input.samples,
      minutesToKickoff,
    });
    const data = {
      leagueId: prediction.leagueId, kickoff: prediction.kickoff,
      homeTeamId: prediction.homeTeamId, awayTeamId: prediction.awayTeamId,
      homeName: prediction.homeName, awayName: prediction.awayName,
      homeLogo: prediction.homeLogo || null, awayLogo: prediction.awayLogo || null,
      market: input.market, side: input.side, line: input.line,
      modelProbability: input.probability, marketProbability: input.marketProbability,
      edge: decision.edge ?? 0, expectedValue: decision.expectedValue,
      decimalOdds: input.price?.odds ?? null, bookmaker: input.price?.bookmaker ?? null,
      sampleCount: input.samples, reason: decision.reason, stake: 1,
      modelContext: prediction.modelContext, modelVersion: prediction.modelVersion,
      contextVersion: prediction.contextVersion, countModelVersion: input.countModelVersion ?? null,
      referenceOverround: input.overround ?? null, status: decision.status,
      capturedAt: at, qualifiedAt: decision.status === "candidate" ? at : null,
    };
    await prisma.autonomousTipSnapshot.upsert({
      where: { fixtureId_strategy_policyVersion: { fixtureId, strategy: input.strategy, policyVersion: version } },
      create: { fixtureId, strategy: input.strategy, policyVersion: version, ...data },
      update: data,
    });
    if (decision.status === "candidate") created++;
  }
  return created;
}

export async function closeAutonomousPortfolio(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  // Closing je kandidat, ktery se v poslednich 3 hodinach zpresnuje kazdym vzorkem.
  // Samotny vyber zustava nemenny; meni se pouze auditni posledni predvykopova cena.
  const rows = await prisma.autonomousTipSnapshot.findMany({ where: { fixtureId, status: "candidate" } });
  for (const row of rows) {
    const minutesToKickoff = (row.kickoff.getTime() - at.getTime()) / 60_000;
    if (minutesToKickoff < 0 || minutesToKickoff > RELIABLE_CLOSE_MAX_MINUTES) continue;
    const probability = marketProbabilityAt(books, row.market as never, row.side as never, row.line);
    if (probability == null) continue;
    await prisma.autonomousTipSnapshot.update({ where: { id: row.id }, data: { closingMarketProbability: probability, closedAt: at } });
  }
}

/** Doplní pouze výsledkovou část neměnného rohového výběru. */
export async function settleAutonomousCountPortfolio(fixtureId: number, at: Date): Promise<number> {
  const rows = await prisma.autonomousTipSnapshot.findMany({
    where: { fixtureId, strategy: "CORNERS", status: "candidate", settledAt: null },
  });
  if (!rows.length) return 0;
  const stats = await prisma.matchStatCache.findMany({
    where: { fixtureId },
    select: { teamId: true, corners: true },
  });
  let settled = 0;
  for (const row of rows) {
    const home = stats.find((item) => item.teamId === row.homeTeamId)?.corners;
    const away = stats.find((item) => item.teamId === row.awayTeamId)?.corners;
    if (home == null || away == null) continue;
    const actualCount = home + away;
    const hit = binaryOutcome(row.market, row.side, null, null, row.line, actualCount);
    if (hit == null) continue;
    const result = await prisma.autonomousTipSnapshot.updateMany({
      where: { id: row.id, settledAt: null },
      data: {
        settlementStatus: "SETTLED",
        actualCount,
        hit,
        profit: portfolioProfit(hit, row.decimalOdds, row.stake),
        settledAt: at,
      },
    });
    settled += result.count;
  }
  return settled;
}
