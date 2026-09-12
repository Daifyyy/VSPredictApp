import { prisma } from "@/lib/db";
import { catalogLeagueName } from "@/lib/data/catalog";
import { previewIntuitionTickets } from "@/lib/data/intuitionTicketStore";
import { pragueDateBounds } from "@/lib/recentWindow";
import { summarizePortfolio, type PortfolioSummary } from "@/lib/picks/portfolioStats";
import { STRATEGY_HUB_CATALOG, type StrategyHubId } from "@/lib/picks/strategyHub";

export interface StrategyHubOpportunity {
  id: string;
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
}

const emptySummary = (): PortfolioSummary => ({ total: 0, pending: 0, settled: 0, hits: 0, accuracy: null, staked: 0, profit: 0, roi: null, averageOdds: null, averageClv: null, clvComplete: 0, maxDrawdown: 0, roiConfidence95: null });
const outcome = (hit: boolean | null, voided = false): StrategyHubOpportunity["outcome"] => voided ? "VOID" : hit == null ? "PENDING" : hit ? "WON" : "LOST";
const fmtLine = (line: number | null) => line == null ? "" : String(line).replace(".", ",");
const totalLabel = (side: string, line: number | null, noun = "gólu") => `${side.toUpperCase().includes("UNDER") ? "méně" : "více"} než ${fmtLine(line)} ${noun}`;

function autonomousSelection(strategy: StrategyHubId, side: string, line: number | null, home: string, away: string) {
  if (strategy === "ONE_X_TWO") return side === "HOME" ? `Výhra ${home}` : side === "AWAY" ? `Výhra ${away}` : "Remíza";
  if (strategy === "OVER_25") return "Více než 2,5 gólu";
  if (strategy === "BTTS_YES") return "Oba týmy skórují – ano";
  if (strategy === "CORNERS") return totalLabel(side, line, "rohu");
  if (strategy === "CARDS_REF") return totalLabel(side, line, "karty");
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

  if (strategy === "VALUE" || strategy === "ELO_INTUITION") {
    const [rows, preview] = await Promise.all([
      prisma.intuitionTicket.findMany({ where: { strategy, policyVersion: definition.policyVersion }, orderBy: [{ lockedAt: "asc" }, { slot: "asc" }], include: { legs: { orderBy: { kickoff: "asc" } } } }),
      previewIntuitionTickets(date),
    ]);
    const block = preview.strategies.find((item) => item.strategy === strategy)!;
    const dated = block.tickets;
    const portfolioRows = rows.map((row) => ({ strategy, stake: 1, odds: row.naturalCombinedOdds, hit: row.hit, marketProbability: row.naturalCombinedOdds ? 1 / row.naturalCombinedOdds : 0, closingMarketProbability: null, qualifiedAt: row.lockedAt }));
    const legs = dated.flatMap((ticket) => ticket.legs.filter((leg) => leg.kickoff >= bounds.start && leg.kickoff < bounds.end).map((leg) => ({ ticket, leg })));
    const byFixture = new Map<number, StrategyHubOpportunity>();
    for (const { ticket, leg } of legs) {
      const existing = byFixture.get(leg.fixtureId);
      if (existing) { if (!existing.ticketSlots.includes(ticket.slot)) existing.ticketSlots.push(ticket.slot); continue; }
      byFixture.set(leg.fixtureId, {
        id: "id" in leg ? leg.id : `${strategy}-${ticket.slot}-${leg.fixtureId}`, fixtureId: leg.fixtureId, leagueId: leg.leagueId, leagueName: catalogLeagueName(leg.leagueId, ""), kickoff: leg.kickoff.toISOString(), homeName: leg.homeName, awayName: leg.awayName,
        selection: `${leg.winnerName} + ${leg.totalSide === "OVER" ? "více" : "méně"} než ${fmtLine(leg.totalLine)} gólu`, reason: leg.reason, risk: leg.risk,
        probability: strategy === "VALUE" ? leg.modelProbability : leg.eloJointProbability ?? null, marketProbability: leg.decimalOdds ? 1 / leg.decimalOdds : null,
        edge: leg.eloWinnerProbability != null && leg.marketWinnerProbability != null ? leg.eloWinnerProbability - leg.marketWinnerProbability : null,
        expectedValue: (strategy === "VALUE" ? leg.modelExpectedValue : leg.eloExpectedValue) ?? null, confidence: leg.contextScore ?? null, odds: leg.decimalOdds, bookmaker: leg.bookmaker,
        priceKind: leg.priceKind as StrategyHubOpportunity["priceKind"], outcome: outcome(leg.hit), score: leg.homeGoals == null || leg.awayGoals == null ? null : `${leg.homeGoals}:${leg.awayGoals}`, ticketSlots: [ticket.slot],
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

  if (strategy === "FOULS") {
    const rows = await prisma.fixturePrediction.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, modelContext: "LEAGUE", lambdaFoulsHome: { not: null }, lambdaFoulsAway: { not: null } }, orderBy: { kickoff: "asc" } });
    const opportunities: StrategyHubOpportunity[] = rows.map((row) => ({ id: `foul-${row.fixtureId}`, fixtureId: row.fixtureId, leagueId: row.leagueId, leagueName: catalogLeagueName(row.leagueId, ""), kickoff: row.kickoff.toISOString(), homeName: row.homeName, awayName: row.awayName, selection: `Odhad celkem ${(row.lambdaFoulsHome! + row.lambdaFoulsAway!).toFixed(1)} faulu`, reason: `Domácí ${row.lambdaFoulsHome!.toFixed(1)} · hosté ${row.lambdaFoulsAway!.toFixed(1)}`, risk: "Pro tento výzkumný model není dostupná tržní linie ani realizovatelný kurz.", probability: null, marketProbability: null, edge: null, expectedValue: null, confidence: row.readinessSample, odds: null, bookmaker: null, priceKind: "NONE", outcome: "PENDING", score: null, ticketSlots: [] }));
    return { opportunities, tickets: [], metrics: { all: emptySummary(), recent: emptySummary(), selectionAccuracy: null, unit: "FORECASTS" } satisfies StrategyHubMetrics, coverage: { candidates: opportunities.length, priced: 0, tickets: 0 }, emptyReason: opportunities.length ? null : "NO_FORECASTS" };
  }

  if (strategy === "TEAM_GOALS") {
    const rows = await prisma.marketSignalSnapshot.findMany({ where: { policyVersion: definition.policyVersion, market: { in: ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] }, modelContext: "LEAGUE" }, orderBy: { openedAt: "asc" } });
    const fixtureIds = [...new Set(rows.map((row) => row.fixtureId))];
    const fixtures = fixtureIds.length ? await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } } }) : [];
    const fixtureById = new Map(fixtures.map((row) => [row.fixtureId, row]));
    const mapped = rows.map((row) => { const fixture = fixtureById.get(row.fixtureId); const hit = teamGoalHit(row.market, fixture?.homeGoals ?? null, fixture?.awayGoals ?? null); return { row, fixture, hit }; });
    const summaryRows = mapped.map(({ row, hit }) => ({ strategy, stake: 1, odds: row.decimalOdds, hit, marketProbability: row.openMarketProbability, closingMarketProbability: row.closeMarketProbability, qualifiedAt: row.openedAt }));
    const daily = mapped.filter(({ row }) => row.kickoff >= bounds.start && row.kickoff < bounds.end);
    const opportunities: StrategyHubOpportunity[] = daily.flatMap(({ row, fixture, hit }) => fixture ? [{ id: row.id, fixtureId: row.fixtureId, leagueId: row.leagueId, leagueName: catalogLeagueName(row.leagueId, ""), kickoff: row.kickoff.toISOString(), homeName: fixture.homeName, awayName: fixture.awayName, selection: teamGoalSelection(row.market, fixture.homeName, fixture.awayName), reason: `Model ${(row.modelProbability * 100).toFixed(0)} % proti trhu ${(row.openMarketProbability * 100).toFixed(0)} %.`, risk: row.decimalOdds == null ? "Při kvalifikaci nebyla zmrazena realizovatelná cena." : "Výzkumná strategie zatím nemá dostatečný potvrzený vzorek.", probability: row.modelProbability, marketProbability: row.openMarketProbability, edge: row.modelProbability - row.openMarketProbability, expectedValue: row.decimalOdds ? row.modelProbability * row.decimalOdds - 1 : null, confidence: null, odds: row.decimalOdds, bookmaker: row.bookmaker, priceKind: row.decimalOdds ? "DIRECT" : "NONE", outcome: outcome(hit), score: fixture.homeGoals == null || fixture.awayGoals == null ? null : `${fixture.homeGoals}:${fixture.awayGoals}`, ticketSlots: [] }] : []);
    return { opportunities, tickets: [], metrics: { all: summarizePortfolio(summaryRows), recent: summarizePortfolio(summaryRows.filter((item) => new Date(item.qualifiedAt) >= recentFrom)), selectionAccuracy: summarizePortfolio(summaryRows).accuracy, unit: "SELECTIONS" } satisfies StrategyHubMetrics, coverage: { candidates: opportunities.length, priced: opportunities.filter((item) => item.odds != null).length, tickets: 0 }, emptyReason: opportunities.length ? null : "NOT_ENOUGH_CANDIDATES" };
  }

  const rows = await prisma.autonomousTipSnapshot.findMany({ where: { strategy, policyVersion: definition.policyVersion, status: "candidate", modelContext: "LEAGUE" }, orderBy: { qualifiedAt: "asc" } });
  const summaryRows = rows.map((row) => ({ strategy, stake: row.stake, odds: row.decimalOdds, hit: row.hit, marketProbability: row.marketProbability, closingMarketProbability: row.closingMarketProbability, qualifiedAt: row.qualifiedAt }));
  const dailyRows = rows.filter((row) => row.kickoff >= bounds.start && row.kickoff < bounds.end);
  const results = dailyRows.length ? await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: dailyRows.map((row) => row.fixtureId) } }, select: { fixtureId: true, homeGoals: true, awayGoals: true } }) : [];
  const resultByFixture = new Map(results.map((row) => [row.fixtureId, row]));
  const opportunities: StrategyHubOpportunity[] = dailyRows.map((row) => { const result = resultByFixture.get(row.fixtureId);
    return { id: row.id, fixtureId: row.fixtureId, leagueId: row.leagueId, leagueName: catalogLeagueName(row.leagueId, ""), kickoff: row.kickoff.toISOString(), homeName: row.homeName, awayName: row.awayName, selection: autonomousSelection(strategy, row.side, row.line, row.homeName, row.awayName), reason: row.reason, risk: row.decimalOdds == null ? "Chybí realizovatelný kurz." : definition.status === "RESEARCH" ? "Výzkumná strategie ještě nemá potvrzený vzorek." : "Výsledek jednoho zápasu má přirozeně vysokou varianci.", probability: row.modelProbability, marketProbability: row.marketProbability, edge: row.edge, expectedValue: row.expectedValue, confidence: row.sampleCount, odds: row.decimalOdds, bookmaker: row.bookmaker, priceKind: row.decimalOdds ? "DIRECT" : "NONE", outcome: outcome(row.hit, row.settlementStatus === "VOID"), score: result?.homeGoals == null || result.awayGoals == null ? null : `${result.homeGoals}:${result.awayGoals}`, ticketSlots: [] }; });
  return { opportunities, tickets: [], metrics: { all: summarizePortfolio(summaryRows), recent: summarizePortfolio(summaryRows.filter((item) => item.qualifiedAt && new Date(item.qualifiedAt) >= recentFrom)), selectionAccuracy: summarizePortfolio(summaryRows).accuracy, unit: "SELECTIONS" } satisfies StrategyHubMetrics, coverage: { candidates: opportunities.length, priced: opportunities.filter((item) => item.odds != null).length, tickets: 0 }, emptyReason: opportunities.length ? null : definition.status === "NO_MARKET" ? "NO_MARKET" : "NOT_ENOUGH_CANDIDATES" };
}

export async function strategyHubDailySummary(date: string) {
  const bounds = pragueDateBounds(date);
  const [ticketRows, autonomous, teamGoals, fouls] = await Promise.all([
    prisma.intuitionTicket.findMany({ where: { policyVersion: STRATEGY_HUB_CATALOG[0].policyVersion, legs: { some: { kickoff: { gte: bounds.start, lt: bounds.end } } } }, select: { strategy: true, slot: true, legs: { where: { kickoff: { gte: bounds.start, lt: bounds.end } }, select: { fixtureId: true } } } }),
    prisma.autonomousTipSnapshot.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, status: "candidate", modelContext: "LEAGUE", OR: STRATEGY_HUB_CATALOG.filter((item) => ["ONE_X_TWO", "OVER_25", "BTTS_YES", "CORNERS", "CARDS_REF"].includes(item.id)).map((item) => ({ strategy: item.id, policyVersion: item.policyVersion })) }, select: { strategy: true, fixtureId: true } }),
    prisma.marketSignalSnapshot.count({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, policyVersion: 2, modelContext: "LEAGUE", market: { in: ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"] } } }),
    prisma.fixturePrediction.count({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, modelContext: "LEAGUE", lambdaFoulsHome: { not: null }, lambdaFoulsAway: { not: null } } }),
  ]);
  const values = STRATEGY_HUB_CATALOG.map((definition) => {
    if (definition.id === "VALUE" || definition.id === "ELO_INTUITION") {
      const matching = ticketRows.filter((row) => row.strategy === definition.id);
      return { strategy: definition.id, opportunities: new Set(matching.flatMap((row) => row.legs.map((leg) => leg.fixtureId))).size, tickets: matching.length, emptyReason: matching.length ? null : definition.id === "VALUE" ? "NOT_ENOUGH_VALUE_LEGS" : "NOT_ENOUGH_CONTEXTUAL_LEGS" };
    }
    const opportunities = definition.id === "TEAM_GOALS" ? teamGoals : definition.id === "FOULS" ? fouls : autonomous.filter((row) => row.strategy === definition.id).length;
    return { strategy: definition.id, opportunities, tickets: 0, emptyReason: opportunities ? null : definition.id === "FOULS" ? "NO_FORECASTS" : "NOT_ENOUGH_CANDIDATES" };
  });
  return { activeStrategies: values.filter((item) => item.opportunities > 0).length, opportunities: values.reduce((sum, item) => sum + item.opportunities, 0), tickets: values.reduce((sum, item) => sum + item.tickets, 0), strategies: values };
}
