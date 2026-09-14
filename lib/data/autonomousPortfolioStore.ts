import type { BookOdds } from "./apiFootball";
import { PINNACLE_FIRST_BOOKMAKERS } from "./apiFootball";
import { prisma } from "@/lib/db";
import { sharpFair, sharpFairTotal } from "@/lib/picks/books";
import { referenceLineQuote } from "@/lib/picks/books";
import { AUTONOMOUS_POLICY_VERSION, CORNERS_LIVE_COUNT_MODEL_VERSION, GUARDED_ONE_X_TWO_POLICY_VERSION, evaluateAutonomousTip, evaluateGuardedOneXTwo, type AutonomousStrategy } from "@/lib/picks/autonomousPortfolio";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION, MARKET_SIGNAL_POLICY_VERSION, marketProbabilityAt } from "@/lib/picks/marketSignals";
import { isPublicClubLeague } from "./catalog";
import { binaryOutcome, portfolioProfit, RELIABLE_CLOSE_MAX_MINUTES } from "@/lib/picks/evaluation";
import { CLV_METHOD_VERSION, clvV2, comparableMarketQuote, type ComparableMarket } from "@/lib/picks/comparableMarketQuote";

const countActivationCache = new Map<string, { enabled: boolean; expiresAt: number }>();

async function countResearchEnabled(strategy: "CORNERS" | "CARDS_REF" | "FOULS", modelVersion: number, at: Date): Promise<boolean> {
  const cacheKey = `${strategy}:${modelVersion}`;
  const cached = countActivationCache.get(cacheKey);
  if (cached && cached.expiresAt > at.getTime()) return cached.enabled;
  const definition = await prisma.modelStrategyDefinition.findUnique({
    where: { strategy_policyVersion_modelContext_modelVersion: { strategy, policyVersion: AUTONOMOUS_POLICY_VERSION[strategy], modelContext: "LEAGUE", modelVersion } },
    select: { status: true, startedAt: true },
  });
  const enabled = definition == null || (["RESEARCH", "LIVE_TEST", "CANDIDATE"].includes(definition.status) && definition.startedAt <= at);
  countActivationCache.set(cacheKey, { enabled, expiresAt: at.getTime() + 60_000 });
  return enabled;
}

type Side = "HOME" | "AWAY" | "OVER" | "UNDER";

function auditMarket(market: string): ComparableMarket {
  if (market.startsWith("TEAM_HOME")) return "TEAM_HOME";
  if (market.startsWith("TEAM_AWAY")) return "TEAM_AWAY";
  return market as ComparableMarket;
}

const auditQuote = (books: BookOdds[], market: string, side: string, line: number | null, at: Date) =>
  comparableMarketQuote({ books, market: auditMarket(market), side: side as Side, line, sampledAt: at });

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
      { market: { in: ["CORNERS", "CARDS", "FOULS"] }, policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
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
  const cardSignal = byMarket.get("CARDS");
  const foulSignal = byMarket.get("FOULS");
  const [cornerEnabled, cardEnabled, foulEnabled] = await Promise.all([
    countResearchEnabled("CORNERS", prediction.modelVersion, at),
    countResearchEnabled("CARDS_REF", prediction.modelVersion, at),
    countResearchEnabled("FOULS", prediction.modelVersion, at),
  ]);
  const cornerSide = cornerSignal?.side === "UNDER" ? "UNDER" : "OVER";
  const cornerQuote = cornerSignal?.line == null ? null : referenceLineQuote(books, "corners", cornerSignal.line, cornerSide === "OVER" ? "over" : "under", PINNACLE_FIRST_BOOKMAKERS);
  const cardSide = cardSignal?.side === "UNDER" ? "UNDER" : "OVER";
  const cardQuote = cardSignal?.line == null ? null : referenceLineQuote(books, "cards", cardSignal.line, cardSide === "OVER" ? "over" : "under", PINNACLE_FIRST_BOOKMAKERS);
  const foulSide = foulSignal?.side === "UNDER" ? "UNDER" : "OVER";
  const foulQuote = foulSignal?.line == null ? null : referenceLineQuote(books, "fouls", foulSignal.line, foulSide === "OVER" ? "over" : "under", PINNACLE_FIRST_BOOKMAKERS);
  const inputs: Array<{ strategy: AutonomousStrategy; market: string; side: Side; line: number | null; probability: number; marketProbability: number | null; second?: number; price: { odds: number; bookmaker: string } | null; samples: number; overround?: number | null; countModelVersion?: number | null }> = [
    { strategy: "ONE_X_TWO", market: "1X2", side: oneSide, line: null, probability: oneProb, marketProbability: oneFair ? (oneSide === "HOME" ? oneFair.home : oneFair.away) : null, second: Math.max(prediction.draw, oneSide === "HOME" ? prediction.awayWin : prediction.homeWin), price: referenceOneXTwo(books, oneSide), samples: Array.isArray(byMarket.get("1X2")?.series) ? (byMarket.get("1X2")!.series as unknown[]).length : 0, overround: oneFair?.overround },
    { strategy: "OVER_25", market: "OVER_25", side: "OVER", line: 2.5, probability: prediction.over25, marketProbability: totalFair?.over25 ?? null, price: referenceBook(books, "OVER_25"), samples: Array.isArray(byMarket.get("OVER_25")?.series) ? (byMarket.get("OVER_25")!.series as unknown[]).length : 0, overround: totalFair?.overround },
    { strategy: "BTTS_YES", market: "BTTS", side: "OVER", line: null, probability: prediction.bttsYes, marketProbability: bttsFair?.yes ?? null, price: referenceBook(books, "BTTS_YES"), samples: Array.isArray(byMarket.get("BTTS")?.series) ? (byMarket.get("BTTS")!.series as unknown[]).length : 0, overround: bttsFair?.overround },
    ...(cornerEnabled && isPublicClubLeague(prediction.leagueId) && prediction.modelContext === "LEAGUE" && prediction.countModelVersion === CORNERS_LIVE_COUNT_MODEL_VERSION && cornerSignal?.countModelVersion === CORNERS_LIVE_COUNT_MODEL_VERSION && cornerSignal?.line != null && Math.abs(cornerSignal.line % 1) === 0.5 && cornerQuote
      ? [{ strategy: "CORNERS" as const, market: "CORNERS", side: cornerSide as Side, line: cornerSignal.line, probability: cornerSignal.modelProbability, marketProbability: cornerQuote.probability, price: { odds: cornerQuote.odds, bookmaker: cornerQuote.bookmaker }, samples: Array.isArray(cornerSignal.series) ? (cornerSignal.series as unknown[]).length : 0, overround: cornerQuote.overround, countModelVersion: prediction.countModelVersion }]
      : []),
    ...(cardEnabled && isPublicClubLeague(prediction.leagueId) && prediction.modelContext === "LEAGUE" && prediction.countModelVersion === CORNERS_LIVE_COUNT_MODEL_VERSION && prediction.refereeName && (prediction.refereeSample ?? 0) >= 5 && cardSignal?.countModelVersion === CORNERS_LIVE_COUNT_MODEL_VERSION && cardSignal?.line != null && Math.abs(cardSignal.line % 1) === 0.5 && cardQuote
      ? [{ strategy: "CARDS_REF" as const, market: "CARDS", side: cardSide as Side, line: cardSignal.line, probability: cardSignal.modelProbability, marketProbability: cardQuote.probability, price: { odds: cardQuote.odds, bookmaker: cardQuote.bookmaker }, samples: Array.isArray(cardSignal.series) ? (cardSignal.series as unknown[]).length : 0, overround: cardQuote.overround, countModelVersion: prediction.countModelVersion }]
      : []),
    ...(foulEnabled && isPublicClubLeague(prediction.leagueId) && prediction.modelContext === "LEAGUE" && prediction.foulModelVersion != null && foulSignal?.countModelVersion === prediction.foulModelVersion && foulSignal?.line != null && Math.abs(foulSignal.line % 1) === 0.5 && foulQuote
      ? [{ strategy: "FOULS" as const, market: "FOULS", side: foulSide as Side, line: foulSignal.line, probability: foulSignal.modelProbability, marketProbability: foulQuote.probability, price: { odds: foulQuote.odds, bookmaker: foulQuote.bookmaker }, samples: Array.isArray(foulSignal.series) ? (foulSignal.series as unknown[]).length : 0, overround: foulQuote.overround, countModelVersion: prediction.foulModelVersion }]
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
    const openingAudit = auditQuote(books, input.market, input.side, input.line, at);
    const data = {
      leagueId: prediction.leagueId, kickoff: prediction.kickoff,
      homeTeamId: prediction.homeTeamId, awayTeamId: prediction.awayTeamId,
      homeName: prediction.homeName, awayName: prediction.awayName,
      homeLogo: prediction.homeLogo || null, awayLogo: prediction.awayLogo || null,
      market: input.market, side: input.side, line: input.line,
      modelProbability: input.probability, marketProbability: input.marketProbability,
      edge: decision.edge ?? 0, expectedValue: decision.expectedValue,
      decimalOdds: input.price?.odds ?? null, bookmaker: input.price?.bookmaker ?? null,
      openingBookmakerId: openingAudit.bookmakerId,
      openingBookmaker: openingAudit.bookmaker,
      openingDecimalOdds: openingAudit.decimalOdds,
      openingOppositeOdds: openingAudit.oppositeOdds,
      openingLine: openingAudit.line,
      openingBenchmarkQuality: openingAudit.benchmarkQuality,
      openingBenchmarkProbability: openingAudit.fairProbability,
      sampleCount: input.samples, reason: decision.reason, stake: 1,
      modelContext: prediction.modelContext, modelVersion: prediction.modelVersion,
      contextVersion: prediction.contextVersion, countModelVersion: input.countModelVersion ?? null,
      modelInputSnapshot: prediction.inputSnapshot ?? undefined,
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
  // Shadow politika se uklada oddelene a nikdy se nepocita do verejneho portfolia v2.
  if (oneFair) {
    const marketProbability = oneSide === "HOME" ? oneFair.home : oneFair.away;
    const price = referenceOneXTwo(books, oneSide);
    const sampleCount = Array.isArray(byMarket.get("1X2")?.series) ? (byMarket.get("1X2")!.series as unknown[]).length : 0;
    const decision = evaluateGuardedOneXTwo({
      modelProbability: oneProb, marketProbability, decimalOdds: price?.odds ?? null,
      secondProbability: Math.max(prediction.draw, oneSide === "HOME" ? prediction.awayWin : prediction.homeWin),
      readinessSample: prediction.readinessSample, lowConfidence: prediction.lowConfidence, sampleCount, minutesToKickoff,
    });
    const key = { fixtureId, strategy: "ONE_X_TWO_GUARDED", policyVersion: GUARDED_ONE_X_TWO_POLICY_VERSION };
    const existing = await prisma.autonomousTipSnapshot.findUnique({ where: { fixtureId_strategy_policyVersion: key } });
    if (existing?.status !== "candidate") {
      const shared = {
        leagueId: prediction.leagueId, kickoff: prediction.kickoff, homeTeamId: prediction.homeTeamId, awayTeamId: prediction.awayTeamId,
        homeName: prediction.homeName, awayName: prediction.awayName, homeLogo: prediction.homeLogo || null, awayLogo: prediction.awayLogo || null,
        market: "1X2", side: oneSide, line: null, modelProbability: oneProb, marketProbability,
        edge: decision.edge ?? 0, expectedValue: decision.expectedValue, decimalOdds: price?.odds ?? null, bookmaker: price?.bookmaker ?? null,
        sampleCount, reason: decision.reason, stake: 1, modelContext: prediction.modelContext, modelVersion: prediction.modelVersion,
        contextVersion: prediction.contextVersion, modelInputSnapshot: prediction.inputSnapshot ?? undefined, referenceOverround: oneFair.overround, status: decision.status,
        capturedAt: at, qualifiedAt: decision.status === "candidate" ? at : null,
      };
      await prisma.autonomousTipSnapshot.upsert({
        where: { fixtureId_strategy_policyVersion: key },
        create: { ...key, ...shared },
        update: shared,
      });
    }
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
    const closing = auditQuote(books, row.market, row.side, row.openingLine ?? row.line, at);
    const opening = {
      bookmakerId: row.openingBookmakerId, bookmaker: row.openingBookmaker,
      decimalOdds: row.openingDecimalOdds, oppositeOdds: row.openingOppositeOdds,
      fairProbability: row.openingBenchmarkProbability,
      line: row.openingLine ?? row.line, sampledAt: row.qualifiedAt ?? row.capturedAt,
      benchmarkQuality: (row.openingBenchmarkQuality ?? "UNAVAILABLE") as "PANEL" | "PINNACLE_SINGLE" | "CROSS_BOOK" | "UNAVAILABLE",
      panelSize: 0,
    };
    const audit = clvV2({ opening, closing, kickoff: row.kickoff });
    await prisma.autonomousTipSnapshot.update({ where: { id: row.id }, data: {
      closingMarketProbability: probability, closedAt: at,
      closingDecimalOdds: closing.decimalOdds, closingOppositeOdds: closing.oppositeOdds,
      closingBookmakerId: closing.bookmakerId, closingBookmaker: closing.bookmaker,
      closingLine: closing.line, closingBenchmarkQuality: closing.benchmarkQuality,
      closingBenchmarkProbability: closing.fairProbability, closingFreshness: audit.freshness,
      sameBookClv: audit.sameBook, priceClv: audit.priceClv,
      probabilityClv: audit.probabilityClv, lineMovement: audit.lineMovement,
      clvMethodVersion: CLV_METHOD_VERSION,
    } });
  }
}

/** Doplní výsledkovou část neměnného výběru rohů nebo karet. */
export async function settleAutonomousCountPortfolio(fixtureId: number, at: Date): Promise<number> {
  const rows = await prisma.autonomousTipSnapshot.findMany({
    where: { fixtureId, strategy: { in: ["CORNERS", "CARDS_REF", "FOULS"] }, status: "candidate", settledAt: null },
  });
  if (!rows.length) return 0;
  const stats = await prisma.matchStatCache.findMany({
    where: { fixtureId },
    select: { teamId: true, corners: true, yellowCards: true, redCards: true, fouls: true },
  });
  let settled = 0;
  for (const row of rows) {
    const homeStat = stats.find((item) => item.teamId === row.homeTeamId);
    const awayStat = stats.find((item) => item.teamId === row.awayTeamId);
    const home = row.market === "CARDS" ? homeStat?.yellowCards == null && homeStat?.redCards == null ? null : (homeStat?.yellowCards ?? 0) + (homeStat?.redCards ?? 0) : row.market === "FOULS" ? homeStat?.fouls : homeStat?.corners;
    const away = row.market === "CARDS" ? awayStat?.yellowCards == null && awayStat?.redCards == null ? null : (awayStat?.yellowCards ?? 0) + (awayStat?.redCards ?? 0) : row.market === "FOULS" ? awayStat?.fouls : awayStat?.corners;
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
