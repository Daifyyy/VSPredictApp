import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { catalogLeagueName } from "@/lib/data/catalog";
import { previewIntuitionTickets } from "@/lib/data/intuitionTicketStore";
import { pragueDateBounds } from "@/lib/recentWindow";
import { summarizePortfolio, type PortfolioSummary } from "@/lib/picks/portfolioStats";
import { STRATEGY_HUB_CATALOG, type StrategyHubId } from "@/lib/picks/strategyHub";
import { resolvedStrategyOutcome } from "@/lib/picks/strategyOutcome";
import { teamGoalOpportunityDecision } from "@/lib/picks/marketSignals";
import { PRESSURE_FLOW_V5_POLICY_VERSION } from "@/lib/picks/pressureFlowV5";
import type { PerformancePressureShadowV5 } from "@/lib/picks/performancePressureShadowV5";

export interface StrategyHubOpportunity {
  id: string;
  market?: string;
  fixtureId: number;
  leagueId: number;
  leagueName: string;
  kickoff: string;
  homeName: string;
  awayName: string;
  selection: string;
  reason: string;
  risk: string;
  probability: number | null;
  marketProbability: number | null;
  edge: number | null;
  expectedValue: number | null;
  confidence: number | null;
  odds: number | null;
  bookmaker: string | null;
  priceKind: "DIRECT" | "SYNTHETIC" | "NONE";
  outcome: "PENDING" | "WON" | "LOST" | "VOID";
  score: string | null;
  ticketSlots: number[];
  strategyConflict?: string | null;
}

export interface StrategyHubTicket {
  slot: number;
  odds: number | null;
  estimatedPriceCount: number;
  outcome: "PENDING" | "WON" | "LOST" | "VOID";
  profit: number | null;
  fixtureIds: number[];
}

export interface StrategyHubMetrics {
  all: PortfolioSummary;
  recent: PortfolioSummary;
  selectionAccuracy: number | null;
  direct?: PortfolioSummary;
  synthetic?: PortfolioSummary;
  unit: "TICKETS" | "SELECTIONS" | "FORECASTS";
  forecastMae?: number | null;
  forecastBias?: number | null;
  actualCoverage?: number | null;
}

export interface StrategyHubPrediction {
  fixtureId: number; leagueId: number; leagueName: string; kickoff: string; homeName: string; awayName: string;
  expectedGoals: { home: number; away: number }; expectedShots: { home: number | null; away: number | null; low: number | null; high: number | null };
  probabilities: { over25: number; btts: number; home05: number; home15: number; away05: number; away15: number };
  tempo: "LOW" | "NORMAL" | "HIGH" | "EXTREME"; dominance: { side: "HOME" | "AWAY" | "EVEN"; share: number };
  confidence: number; warnings: string[];
}

const outcome = (hit: boolean | null, voided = false): StrategyHubOpportunity["outcome"] => voided ? "VOID" : hit == null ? "PENDING" : hit ? "WON" : "LOST";
const fmtLine = (line: number | null) => line == null ? "" : String(line).replace(".", ",");
const totalLabel = (side: string, line: number | null, noun = "gólu") => `${side.toUpperCase().includes("UNDER") ? "méně" : "více"} než ${fmtLine(line)} ${noun}`;

function autonomousSelection(strategy: StrategyHubId, side: string, line: number | null, home: string, away: string) {
  if (strategy === "ONE_X_TWO") return side === "HOME" ? `Výhra ${home}` : side === "AWAY" ? `Výhra ${away}` : "Remíza";
  if (strategy === "OVER_25") return "Více než 2,5 gólu";
  if (strategy === "BTTS_YES") return "Oba týmy skórují – ano";
  if (strategy === "CORNERS") return totalLabel(side, line, "rohu");
  if (strategy === "CARDS_REF") return totalLabel(side, line, "karty");
  if (strategy === "FOULS") return totalLabel(side, line, "faulů");
  return side;
}

function teamGoalSelection(market: string, home: string, away: string) {
  const team = market.includes("HOME") ? home : away;
  const line = market.endsWith("15") ? "1,5" : "0,5";
  return `${team} více než ${line} gólu`;
}

function teamGoalHit(market: string, homeGoals: number | null, awayGoals: number | null) {
  if (homeGoals == null || awayGoals == null) return null;
  const goals = market.includes("HOME") ? homeGoals : awayGoals;
  return goals > (market.endsWith("15") ? 1.5 : .5);
}

export async function strategyHubData(strategy: StrategyHubId, date: string) {
  const definition = STRATEGY_HUB_CATALOG.find((item) => item.id === strategy)!;
  const bounds = pragueDateBounds(date);
  const recentFrom = new Date(Date.now() - 30 * 86400_000);

  if (strategy === "PRESSURE_FLOW_V5") {
    const [signals, dayPredictions] = await Promise.all([
      prisma.marketSignalSnapshot.findMany({ where: { policyVersion: PRESSURE_FLOW_V5_POLICY_VERSION }, orderBy: { openedAt: "asc" } }),
      prisma.fixturePrediction.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, inputSnapshot: { not: Prisma.DbNull } }, orderBy: { kickoff: "asc" }, select: { fixtureId: true, leagueId: true, kickoff: true, homeName: true, awayName: true, homeGoals: true, awayGoals: true, inputSnapshot: true } }),
    ]);
    const fixtureIds = [...new Set(signals.map((row) => row.fixtureId))];
    const fixtures = fixtureIds.length ? await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, homeName: true, awayName: true, homeGoals: true, awayGoals: true } }) : [];
    const fixtureById = new Map(fixtures.map((row) => [row.fixtureId, row]));
    const portfolioRows = signals.map((row) => { const fixture = fixtureById.get(row.fixtureId); return { strategy, stake: 1, odds: row.decimalOdds, hit: resolvedStrategyOutcome({ market: row.market, side: row.side, line: row.line, homeGoals: fixture?.homeGoals ?? null, awayGoals: fixture?.awayGoals ?? null, actualCount: null }), marketProbability: row.openMarketProbability, closingMarketProbability: row.closeMarketProbability, qualifiedAt: row.openedAt, fixtureId: row.fixtureId, kickoff: row.kickoff, closedAt: row.closedAt, priceClv: row.priceClv, probabilityClv: row.probabilityClv, closingFreshness: row.closingFreshness, benchmarkQuality: row.closingBenchmarkQuality, sameBookClv: row.sameBookClv, clvMethodVersion: row.clvMethodVersion }; });
    const dated = signals.filter((row) => row.kickoff >= bounds.start && row.kickoff < bounds.end);
    const opportunities: StrategyHubOpportunity[] = dated.map((row) => { const fixture = fixtureById.get(row.fixtureId); const hit = resolvedStrategyOutcome({ market: row.market, side: row.side, line: row.line, homeGoals: fixture?.homeGoals ?? null, awayGoals: fixture?.awayGoals ?? null, actualCount: null }); const edge = row.modelProbability - row.openMarketProbability; return {
      id: row.id, market: row.market, fixtureId: row.fixtureId, leagueId: row.leagueId, leagueName: catalogLeagueName(row.leagueId, ""), kickoff: row.kickoff.toISOString(), homeName: fixture?.homeName ?? `Fixture ${row.fixtureId}`, awayName: fixture?.awayName ?? "",
      selection: row.market === "OVER_25" ? `${row.side === "OVER" ? "Více" : "Méně"} než 2,5 gólu` : row.market === "BTTS" ? `Oba týmy skórují – ${row.side === "OVER" ? "ano" : "ne"}` : teamGoalSelection(row.market, fixture?.homeName ?? "Domácí", fixture?.awayName ?? "Hosté"),
      reason: `Model průběhu v5 vidí ${Math.round(row.modelProbability * 100)} % proti trhu ${Math.round(row.openMarketProbability * 100)} %.`, risk: "Výzkumný model zatím nemá dostatečný prospektivní vzorek.", probability: row.modelProbability, marketProbability: row.openMarketProbability, edge, expectedValue: row.decimalOdds == null ? null : row.modelProbability * row.decimalOdds - 1, confidence: null, odds: row.decimalOdds, bookmaker: row.bookmaker, priceKind: row.decimalOdds == null ? "NONE" : "DIRECT", outcome: outcome(hit), score: fixture?.homeGoals == null || fixture.awayGoals == null ? null : `${fixture.homeGoals}:${fixture.awayGoals}`, ticketSlots: [],
    }; });
    const predictions: StrategyHubPrediction[] = dayPredictions.flatMap((row) => { const pressure = (row.inputSnapshot as { performancePressure?: PerformancePressureShadowV5 } | null)?.performancePressure; if (pressure?.version !== 5) return []; const hs = pressure.expectedMatchShape.home.shots, as = pressure.expectedMatchShape.away.shots, share = pressure.expectedMatchShape.home.chanceShare.value ?? .5; return [{ fixtureId: row.fixtureId, leagueId: row.leagueId, leagueName: catalogLeagueName(row.leagueId, ""), kickoff: row.kickoff.toISOString(), homeName: row.homeName, awayName: row.awayName, expectedGoals: pressure.goalLambda, expectedShots: { home: hs.value, away: as.value, low: hs.interval && as.interval ? hs.interval.low + as.interval.low : null, high: hs.interval && as.interval ? hs.interval.high + as.interval.high : null }, probabilities: { over25: pressure.marketProbabilities.OVER_25, btts: pressure.marketProbabilities.BTTS_YES, home05: pressure.marketProbabilities.TEAM_HOME_05, home15: pressure.marketProbabilities.TEAM_HOME_15, away05: pressure.marketProbabilities.TEAM_AWAY_05, away15: pressure.marketProbabilities.TEAM_AWAY_15 }, tempo: pressure.expectedMatchShape.opennessLabel, dominance: { side: share > .55 ? "HOME" : share < .45 ? "AWAY" : "EVEN", share }, confidence: pressure.featureCoverage, warnings: pressure.fallbacks }]; });
    const recentRows = portfolioRows.filter((row) => new Date(row.qualifiedAt) >= recentFrom);
    return { opportunities, predictions, tickets: [], metrics: { all: summarizePortfolio(portfolioRows), recent: summarizePortfolio(recentRows), selectionAccuracy: null, unit: "SELECTIONS" } satisfies StrategyHubMetrics, coverage: { candidates: predictions.length, priced: opportunities.length, tickets: 0 }, emptyReason: opportunities.length ? null : predictions.length ? "NOT_ENOUGH_CANDIDATES" : "NO_FORECASTS" };
  }

  if (strategy === "VALUE" || strategy === "ELO_INTUITION") {
    const [rows, preview] = await Promise.all([
      prisma.intuitionTicket.findMany({
        where: { strategy, policyVersion: definition.policyVersion },
        orderBy: [{ lockedAt: "asc" }, { slot: "asc" }],
        select: { lockedAt: true, naturalCombinedOdds: true, hit: true, priceKind: true, legs: { select: { hit: true } } },
      }),
      previewIntuitionTickets(date),
    ]);
    const block = preview.strategies.find((item) => item.strategy === strategy)!;
    const dated = block.tickets;
    const opposingWinners = new Map<number, Set<string>>();
    for (const otherBlock of preview.strategies) {
      if (otherBlock.strategy === strategy) continue;
      for (const otherTicket of otherBlock.tickets) for (const otherLeg of otherTicket.legs) {
        const winners = opposingWinners.get(otherLeg.fixtureId) ?? new Set<string>();
        winners.add(otherLeg.winner);
        opposingWinners.set(otherLeg.fixtureId, winners);
      }
    }
    const portfolioRows = rows.map((row) => ({ strategy, stake: 1, odds: row.naturalCombinedOdds, hit: row.hit, marketProbability: row.naturalCombinedOdds ? 1 / row.naturalCombinedOdds : 0, closingMarketProbability: null, qualifiedAt: row.lockedAt }));
    const legs = dated.flatMap((ticket) => ticket.legs.filter((leg) => leg.kickoff >= bounds.start && leg.kickoff < bounds.end).map((leg) => ({ ticket, leg })));
    const byFixture = new Map<number, StrategyHubOpportunity>();
    for (const { ticket, leg } of legs) {
      const existing = byFixture.get(leg.fixtureId);
      if (existing) { if (!existing.ticketSlots.includes(ticket.slot)) existing.ticketSlots.push(ticket.slot); continue; }
      byFixture.set(leg.fixtureId, {
        id: "id" in leg ? leg.id : `${strategy}-${ticket.slot}-${leg.fixtureId}`, fixtureId: leg.fixtureId, leagueId: leg.leagueId, leagueName: catalogLeagueName(leg.leagueId, ""), kickoff: leg.kickoff.toISOString(), homeName: leg.homeName, awayName: leg.awayName,
        selection: `${leg.winnerName} + ${leg.totalSide === "OVER" ? "více" : "méně"} než ${fmtLine(leg.totalLine)} gólu`, reason: leg.reason, risk: leg.risk,
        probability: strategy === "VALUE" ? leg.decisionProbability ?? leg.modelProbability : leg.eloJointProbability ?? null, marketProbability: strategy === "VALUE" ? leg.marketAnchorProbability ?? (leg.decimalOdds ? 1 / leg.decimalOdds : null) : leg.decimalOdds ? 1 / leg.decimalOdds : null,
        edge: leg.eloWinnerProbability != null && leg.marketWinnerProbability != null ? leg.eloWinnerProbability - leg.marketWinnerProbability : null,
        expectedValue: (strategy === "VALUE" ? leg.decisionExpectedValue ?? leg.modelExpectedValue : leg.eloExpectedValue) ?? null, confidence: leg.contextScore ?? null, odds: leg.decimalOdds, bookmaker: leg.bookmaker,
        priceKind: leg.priceKind as StrategyHubOpportunity["priceKind"], outcome: outcome(leg.hit), score: leg.homeGoals == null || leg.awayGoals == null ? null : `${leg.homeGoals}:${leg.awayGoals}`, ticketSlots: [ticket.slot],
        strategyConflict: [...(opposingWinners.get(leg.fixtureId) ?? [])].some((winner) => winner !== leg.winner)
          ? "Druhá strategie vybírá v tomto zápase opačného vítěze."
          : null,
      });
    }
    const settledLegs = rows.flatMap((row) => row.legs).filter((leg) => leg.hit != null);
    const directRows = rows.filter((row) => row.priceKind === "DIRECT").map((row) => portfolioRows[rows.indexOf(row)]);
    const syntheticRows = rows.filter((row) => row.priceKind === "SYNTHETIC").map((row) => portfolioRows[rows.indexOf(row)]);
    const tickets: StrategyHubTicket[] = dated.map((ticket) => ({ slot: ticket.slot, odds: ticket.naturalCombinedOdds, estimatedPriceCount: ticket.estimatedPriceCount, outcome: outcome(ticket.hit), profit: ticket.profit, fixtureIds: ticket.legs.map((leg) => leg.fixtureId) }));
    return {
      opportunities: [...byFixture.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff)), tickets,
      metrics: { all: summarizePortfolio(portfolioRows), recent: summarizePortfolio(portfolioRows.filter((row) => new Date(row.qualifiedAt) >= recentFrom)), selectionAccuracy: settledLegs.length ? settledLegs.filter((leg) => leg.hit).length / settledLegs.length : null, direct: summarizePortfolio(directRows), synthetic: summarizePortfolio(syntheticRows), unit: "TICKETS" } satisfies StrategyHubMetrics,
      coverage: { candidates: block.coverage.candidates, priced: block.coverage.withOdds, tickets: tickets.length },
      emptyReason: block.emptyReason,
    };
  }

  if (strategy === "TEAM_GOALS") {
    const rows = await prisma.marketSignalSnapshot.findMany({
      where: { policyVersion: definition.policyVersion, market: { in: ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] }, modelContext: "LEAGUE" },
      orderBy: { openedAt: "asc" },
      select: { id: true, fixtureId: true, leagueId: true, kickoff: true, market: true, modelProbability: true, openMarketProbability: true, closeMarketProbability: true, decimalOdds: true, bookmaker: true, openedAt: true, closedAt: true, closingFreshness: true, closingBenchmarkQuality: true, priceClv: true, probabilityClv: true, sameBookClv: true, clvMethodVersion: true },
    });
    const fixtureIds = [...new Set(rows.map((row) => row.fixtureId))];
    const fixtures = fixtureIds.length ? await prisma.fixturePrediction.findMany({
      where: { fixtureId: { in: fixtureIds } },
      select: { fixtureId: true, homeName: true, awayName: true, homeGoals: true, awayGoals: true },
    }) : [];
    const fixtureById = new Map(fixtures.map((row) => [row.fixtureId, row]));
    const qualifiedByFixture = new Map<number, { row: typeof rows[number]; fixture: typeof fixtures[number] | undefined; hit: boolean | null; decision: ReturnType<typeof teamGoalOpportunityDecision> }>();
    for (const row of rows) {
      const fixture = fixtureById.get(row.fixtureId);
      const hit = teamGoalHit(row.market, fixture?.homeGoals ?? null, fixture?.awayGoals ?? null);
      const decision = teamGoalOpportunityDecision({ fixtureId: row.fixtureId, market: row.market, line: row.market.endsWith("15") ? 1.5 : .5, modelProbability: row.modelProbability, marketProbability: row.openMarketProbability, decimalOdds: row.decimalOdds });
      if (!decision.eligible) continue;
      const current = qualifiedByFixture.get(row.fixtureId);
      if (!current || decision.score > current.decision.score) qualifiedByFixture.set(row.fixtureId, { row, fixture, hit, decision });
    }
    const qualified = [...qualifiedByFixture.values()];
    const summaryRows = qualified.map(({ row, hit }) => ({ strategy, stake: 1, odds: row.decimalOdds, hit, marketProbability: row.openMarketProbability, closingMarketProbability: row.closeMarketProbability, qualifiedAt: row.openedAt, fixtureId: row.fixtureId, kickoff: row.kickoff, closedAt: row.closedAt, closingFreshness: row.closingFreshness, benchmarkQuality: row.closingBenchmarkQuality, priceClv: row.priceClv, probabilityClv: row.probabilityClv, sameBookClv: row.sameBookClv, clvMethodVersion: row.clvMethodVersion }));
    const daily = qualified.filter(({ row }) => row.kickoff >= bounds.start && row.kickoff < bounds.end);
    const opportunities: StrategyHubOpportunity[] = daily.flatMap(({ row, fixture, hit, decision }) => fixture ? [{ id: row.id, fixtureId: row.fixtureId, leagueId: row.leagueId, leagueName: catalogLeagueName(row.leagueId, ""), kickoff: row.kickoff.toISOString(), homeName: fixture.homeName, awayName: fixture.awayName, selection: teamGoalSelection(row.market, fixture.homeName, fixture.awayName), reason: `Konzervativní odhad ${(decision.decisionProbability * 100).toFixed(0)} % při kurzu ${row.decimalOdds?.toFixed(2)}.`, risk: "Výzkumná strategie zatím nemá dostatečný potvrzený vzorek.", probability: decision.decisionProbability, marketProbability: row.openMarketProbability, edge: decision.decisionProbability - row.openMarketProbability, expectedValue: decision.expectedValue, confidence: null, odds: row.decimalOdds, bookmaker: row.bookmaker, priceKind: "DIRECT", outcome: outcome(hit), score: fixture.homeGoals == null || fixture.awayGoals == null ? null : `${fixture.homeGoals}:${fixture.awayGoals}`, ticketSlots: [] }] : []);
    return { opportunities, tickets: [], metrics: { all: summarizePortfolio(summaryRows), recent: summarizePortfolio(summaryRows.filter((item) => new Date(item.qualifiedAt) >= recentFrom)), selectionAccuracy: summarizePortfolio(summaryRows).accuracy, unit: "SELECTIONS" } satisfies StrategyHubMetrics, coverage: { candidates: opportunities.length, priced: opportunities.filter((item) => item.odds != null).length, tickets: 0 }, emptyReason: opportunities.length ? null : "NOT_ENOUGH_CANDIDATES" };
  }

  const rows = await prisma.autonomousTipSnapshot.findMany({
    where: { strategy, policyVersion: definition.policyVersion, status: "candidate", modelContext: "LEAGUE" },
    orderBy: { qualifiedAt: "asc" },
    select: { id: true, fixtureId: true, leagueId: true, kickoff: true, homeTeamId: true, awayTeamId: true, homeName: true, awayName: true, market: true, side: true, line: true, modelProbability: true, marketProbability: true, edge: true, expectedValue: true, decimalOdds: true, bookmaker: true, sampleCount: true, stake: true, reason: true, qualifiedAt: true, closingMarketProbability: true, closedAt: true, closingFreshness: true, closingBenchmarkQuality: true, priceClv: true, probabilityClv: true, sameBookClv: true, clvMethodVersion: true, settlementStatus: true, actualCount: true, hit: true },
  });
  const fixtureIds = [...new Set(rows.map((row) => row.fixtureId))];
  const countRows = rows.filter((row) => ["CORNERS", "CARDS", "FOULS"].includes(row.market) && row.actualCount == null);
  const [results, cornerStats] = await Promise.all([
    fixtureIds.length ? prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } }, select: { fixtureId: true, homeGoals: true, awayGoals: true } }) : [],
    countRows.length ? prisma.matchStatCache.findMany({ where: { fixtureId: { in: countRows.map((row) => row.fixtureId) } }, select: { fixtureId: true, teamId: true, corners: true, yellowCards: true, redCards: true, fouls: true } }) : [],
  ]);
  const resultByFixture = new Map(results.map((row) => [row.fixtureId, row]));
  const cornerByTeam = new Map(cornerStats.map((row) => [`${row.fixtureId}:${row.teamId}`, row.corners]));
  const cardsByTeam = new Map(cornerStats.map((row) => [`${row.fixtureId}:${row.teamId}`, row.yellowCards == null && row.redCards == null ? null : (row.yellowCards ?? 0) + (row.redCards ?? 0)]));
  const foulsByTeam = new Map(cornerStats.map((row) => [`${row.fixtureId}:${row.teamId}`, row.fouls]));
  const resolved = rows.map((row) => {
    const result = resultByFixture.get(row.fixtureId);
    const homeCorners = cornerByTeam.get(`${row.fixtureId}:${row.homeTeamId}`);
    const awayCorners = cornerByTeam.get(`${row.fixtureId}:${row.awayTeamId}`);
    const homeCards = cardsByTeam.get(`${row.fixtureId}:${row.homeTeamId}`);
    const awayCards = cardsByTeam.get(`${row.fixtureId}:${row.awayTeamId}`);
    const homeFouls = foulsByTeam.get(`${row.fixtureId}:${row.homeTeamId}`);
    const awayFouls = foulsByTeam.get(`${row.fixtureId}:${row.awayTeamId}`);
    const actualCount = row.actualCount ?? (row.market === "CARDS" ? homeCards != null && awayCards != null ? homeCards + awayCards : null : row.market === "FOULS" ? homeFouls != null && awayFouls != null ? homeFouls + awayFouls : null : homeCorners != null && awayCorners != null ? homeCorners + awayCorners : null);
    const hit = resolvedStrategyOutcome({ storedHit: row.hit, market: row.market, side: row.side, line: row.line, homeGoals: result?.homeGoals ?? null, awayGoals: result?.awayGoals ?? null, actualCount });
    return { row, result, hit };
  });
  const summaryRows = resolved.map(({ row, hit }) => ({ strategy, stake: row.stake, odds: row.decimalOdds, hit, marketProbability: row.marketProbability, closingMarketProbability: row.closingMarketProbability, qualifiedAt: row.qualifiedAt, fixtureId: row.fixtureId, kickoff: row.kickoff, closedAt: row.closedAt, closingFreshness: row.closingFreshness, benchmarkQuality: row.closingBenchmarkQuality, priceClv: row.priceClv, probabilityClv: row.probabilityClv, sameBookClv: row.sameBookClv, clvMethodVersion: row.clvMethodVersion }));
  const dailyRows = rows.filter((row) => row.kickoff >= bounds.start && row.kickoff < bounds.end);
  const dailyIds = new Set(dailyRows.map((row) => row.id));
  const opportunities: StrategyHubOpportunity[] = resolved.filter(({ row }) => dailyIds.has(row.id)).map(({ row, result, hit }) => {
    return { id: row.id, fixtureId: row.fixtureId, leagueId: row.leagueId, leagueName: catalogLeagueName(row.leagueId, ""), kickoff: row.kickoff.toISOString(), homeName: row.homeName, awayName: row.awayName, selection: autonomousSelection(strategy, row.side, row.line, row.homeName, row.awayName), reason: row.reason, risk: row.decimalOdds == null ? "Chybí realizovatelný kurz." : definition.status === "RESEARCH" ? "Výzkumná strategie ještě nemá potvrzený vzorek." : "Výsledek jednoho zápasu má přirozeně vysokou varianci.", probability: row.modelProbability, marketProbability: row.marketProbability, edge: row.edge, expectedValue: row.expectedValue, confidence: row.sampleCount, odds: row.decimalOdds, bookmaker: row.bookmaker, priceKind: row.decimalOdds ? "DIRECT" : "NONE", outcome: outcome(hit, row.settlementStatus === "VOID"), score: result?.homeGoals == null || result.awayGoals == null ? null : `${result.homeGoals}:${result.awayGoals}`, ticketSlots: [] }; });
  return { opportunities, tickets: [], metrics: { all: summarizePortfolio(summaryRows), recent: summarizePortfolio(summaryRows.filter((item) => item.qualifiedAt && new Date(item.qualifiedAt) >= recentFrom)), selectionAccuracy: summarizePortfolio(summaryRows).accuracy, unit: "SELECTIONS" } satisfies StrategyHubMetrics, coverage: { candidates: opportunities.length, priced: opportunities.filter((item) => item.odds != null).length, tickets: 0 }, emptyReason: opportunities.length ? null : definition.status === "NO_MARKET" ? "NO_MARKET" : "NOT_ENOUGH_CANDIDATES" };
}

export async function strategyHubDailySummary(date: string) {
  const bounds = pragueDateBounds(date);
  const [ticketRows, autonomous, teamGoals, pressureFlow] = await Promise.all([
    prisma.intuitionTicket.findMany({ where: { policyVersion: STRATEGY_HUB_CATALOG[0].policyVersion, legs: { some: { kickoff: { gte: bounds.start, lt: bounds.end } } } }, select: { strategy: true, slot: true, legs: { where: { kickoff: { gte: bounds.start, lt: bounds.end } }, select: { fixtureId: true } } } }),
    prisma.autonomousTipSnapshot.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, status: "candidate", modelContext: "LEAGUE", OR: STRATEGY_HUB_CATALOG.filter((item) => ["ONE_X_TWO", "OVER_25", "BTTS_YES", "CORNERS", "CARDS_REF", "FOULS"].includes(item.id)).map((item) => ({ strategy: item.id, policyVersion: item.policyVersion })) }, select: { strategy: true, fixtureId: true } }),
    prisma.marketSignalSnapshot.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, policyVersion: STRATEGY_HUB_CATALOG.find((item) => item.id === "TEAM_GOALS")!.policyVersion, modelContext: "LEAGUE", market: { in: ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] } }, select: { fixtureId: true, market: true, modelProbability: true, openMarketProbability: true, decimalOdds: true } }),
    prisma.marketSignalSnapshot.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, policyVersion: PRESSURE_FLOW_V5_POLICY_VERSION }, select: { fixtureId: true } }),
  ]);
  const values = STRATEGY_HUB_CATALOG.map((definition) => {
    if (definition.id === "VALUE" || definition.id === "ELO_INTUITION") {
      const matching = ticketRows.filter((row) => row.strategy === definition.id);
      return { strategy: definition.id, opportunities: new Set(matching.flatMap((row) => row.legs.map((leg) => leg.fixtureId))).size, tickets: matching.length, emptyReason: matching.length ? null : definition.id === "VALUE" ? "NOT_ENOUGH_VALUE_LEGS" : "NOT_ENOUGH_CONTEXTUAL_LEGS" };
    }
    const opportunities = definition.id === "PRESSURE_FLOW_V5" ? new Set(pressureFlow.map((row) => row.fixtureId)).size : definition.id === "TEAM_GOALS" ? new Set(teamGoals.filter((row) => teamGoalOpportunityDecision({ fixtureId: row.fixtureId, market: row.market, line: row.market.endsWith("15") ? 1.5 : .5, modelProbability: row.modelProbability, marketProbability: row.openMarketProbability, decimalOdds: row.decimalOdds }).eligible).map((row) => row.fixtureId)).size : autonomous.filter((row) => row.strategy === definition.id).length;
    return { strategy: definition.id, opportunities, tickets: 0, emptyReason: opportunities ? null : "NOT_ENOUGH_CANDIDATES" };
  });
  return { activeStrategies: values.filter((item) => item.opportunities > 0).length, opportunities: values.reduce((sum, item) => sum + item.opportunities, 0), tickets: values.reduce((sum, item) => sum + item.tickets, 0), strategies: values };
}
