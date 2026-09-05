import type { FixturePrediction } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BookOdds } from "./apiFootball";
import { PINNACLE_FIRST_BOOKMAKERS } from "./apiFootball";
import { FIXTURE_LIST_LEAGUE_IDS, isPublicCompetition } from "./catalog";
import { localDateKey } from "@/lib/competitionGrouping";
import { QUICK_FOCUS_IDS, quickFocusSelection, rankQuickCandidates, type QuickCandidate, type QuickFocusSelection, type QuickMarketSignal } from "@/lib/quickOverview";
import { portfolioProfit, RELIABLE_CLOSE_MAX_MINUTES } from "@/lib/picks/evaluation";
import { quickOverviewOutcome } from "@/lib/picks/quickOverviewPerformance";
import { marketProbabilityAt } from "@/lib/picks/marketSignals";
import { parseBooks } from "@/lib/picks/books";
import type { PredictionRow } from "@/lib/types";
import { pragueDateBounds } from "@/lib/recentWindow";

export const QUICK_OVERVIEW_POLICY_VERSION = 2;

/** Zmrazi prvni kvalitni denni vyber. Volat pouze z kurzoveho cronu. */
export async function captureQuickOverviewDay(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  const trigger = await prisma.fixturePrediction.findUnique({ where: { fixtureId } });
  if (!trigger?.available || !isPublicCompetition(trigger.leagueId) || trigger.kickoff <= at) return;
  const dateKey = localDateKey(trigger.kickoff);
  const frozenCategories = new Set((await prisma.quickOverviewSelection.findMany({ where: { dateKey, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] } }, select: { category: true } })).map((row) => row.category));
  if (frozenCategories.size === QUICK_FOCUS_IDS.length) return;

  const bounds = pragueDateBounds(dateKey);
  const rows = await prisma.fixturePrediction.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, available: true, leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] } } });
  const marketRows = await prisma.marketSignalSnapshot.findMany({ where: { fixtureId: { in: rows.map((row) => row.fixtureId) } }, orderBy: { openedAt: "desc" } });
  const signals = new Map<number, QuickMarketSignal[]>();
  for (const row of marketRows) {
    const list = signals.get(row.fixtureId) ?? [];
    if (list.some((item) => item.market === row.market)) continue;
    const points = Array.isArray(row.series) ? row.series.filter(isPoint) : [];
    list.push({ market: row.market as QuickMarketSignal["market"], side: row.side as QuickMarketSignal["side"], line: row.line, modelProbability: row.modelProbability, openMarketProbability: row.openMarketProbability, currentMarketProbability: points.at(-1)?.p ?? row.closeMarketProbability ?? row.openMarketProbability, samples: points.length });
    signals.set(row.fixtureId, list);
  }
  const candidates: QuickCandidate[] = rows.map((row) => ({ row: toPredictionRow(row), signals: signals.get(row.fixtureId) ?? [] }));
  const rawByFixture = new Map(rows.map((row) => [row.fixtureId, row]));
  const creates = QUICK_FOCUS_IDS.filter((category) => !frozenCategories.has(category)).flatMap((category) => rankQuickCandidates(candidates, category).map(({ candidate, result }, index) => {
    const picked = quickFocusSelection(candidate, category);
    const priceBooks = candidate.row.fixtureId === fixtureId ? books : parseBooks(candidate.row.oddsBooks);
    const price = picked ? referencePrice(priceBooks, picked) : null;
    const storedOddsAt = rawByFixture.get(candidate.row.fixtureId)?.oddsFetchedAt ?? null;
    const oddsAt = candidate.row.fixtureId === fixtureId ? at : storedOddsAt;
    return { dateKey, category, fixtureId: candidate.row.fixtureId, leagueId: candidate.row.leagueId, kickoff: new Date(candidate.row.kickoff), rank: index + 1, reason: result.reason, score: result.score, modelProbability: result.modelProbability, marketProbability: picked?.signal?.currentMarketProbability ?? result.marketProbability, openingMarketProbability: picked?.signal?.openMarketProbability ?? result.marketProbability, marketMove: result.marketMove, marketSamples: result.marketSamples, sourceMarket: picked?.market ?? null, side: picked?.side ?? null, line: picked?.line ?? null, decimalOdds: price?.odds ?? null, bookmaker: price?.bookmaker ?? null, oddsAt: price ? oddsAt : null, modelContext: candidate.row.modelContext, modelVersion: candidate.row.modelVersion, contextVersion: candidate.row.contextVersion ?? 1, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, lowConfidence: candidate.row.lowConfidence, readinessSample: candidate.row.readinessSample, qualifiedAt: at, settlementStatus: category === "team_goals" ? "DIAGNOSTIC" : "PENDING" };
  }));
  if (creates.length) await prisma.quickOverviewSelection.createMany({ data: creates, skipDuplicates: true });
}

/** Připojí poslední srovnatelný předvýkopový benchmark; původní výběr ani kurz nemění. */
export async function closeQuickOverviewSelections(fixtureId: number, books: BookOdds[], at: Date): Promise<void> {
  const prediction = await prisma.fixturePrediction.findUnique({ where: { fixtureId }, select: { kickoff: true } });
  if (!prediction) return;
  const minutes = (prediction.kickoff.getTime() - at.getTime()) / 60_000;
  const quality = minutes >= 0 && minutes <= RELIABLE_CLOSE_MAX_MINUTES ? "FRESH" : "EARLY";
  const rows = await prisma.quickOverviewSelection.findMany({ where: { fixtureId, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, sourceMarket: { not: null }, side: { not: null } } });
  for (const row of rows) {
    const probability = marketProbabilityAt(books, row.sourceMarket as never, row.side as never, row.line);
    if (probability == null) continue;
    await prisma.quickOverviewSelection.update({ where: { id: row.id }, data: { closingMarketProbability: probability, closedAt: at, closingQuality: quality } });
  }
}

/** Faktické vypořádání v2. Početní trhy čekají, dokud jsou obě týmové statistiky dostupné. */
export async function settleQuickOverviewSelections(fixtureId: number, homeGoals: number | null, awayGoals: number | null, at: Date): Promise<number> {
  const rows = await prisma.quickOverviewSelection.findMany({ where: { fixtureId, policyVersion: QUICK_OVERVIEW_POLICY_VERSION, settledAt: null } });
  if (!rows.length || homeGoals == null || awayGoals == null) return 0;
  const stats = await prisma.matchStatCache.findMany({ where: { fixtureId }, select: { teamId: true, corners: true, yellowCards: true, redCards: true } });
  const unique = [...new Map(stats.map((row) => [row.teamId, row])).values()];
  const sum = (pick: (row: typeof unique[number]) => number | null) => { const values = unique.map(pick); return values.length >= 2 && values.every((value) => value != null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null; };
  const corners = sum((row) => row.corners);
  const cards = sum((row) => row.yellowCards == null && row.redCards == null ? null : (row.yellowCards ?? 0) + (row.redCards ?? 0));
  let settled = 0;
  for (const row of rows) {
    const actualCount = row.sourceMarket === "CORNERS" ? corners : row.sourceMarket === "CARDS" ? cards : null;
    const hit = quickOverviewOutcome({ market: row.sourceMarket, side: row.side, line: row.line, homeGoals, awayGoals, actualCount });
    if (hit == null) continue;
    const profit = row.category === "team_goals" ? null : portfolioProfit(hit, row.decimalOdds, 1);
    await prisma.quickOverviewSelection.update({ where: { id: row.id }, data: { settlementStatus: "SETTLED", homeGoals, awayGoals, actualCount, hit, profit, settledAt: at } });
    settled++;
  }
  return settled;
}

/**
 * Opraví pouze odvozený settlement, nikdy původní výběr, stranu, linii ani cenu.
 * Chrání proti starší chybě, kdy se popisek Over/Under mohl rozejít s uloženým hit.
 */
export async function reconcileQuickOverviewSettlements(now = new Date()): Promise<number> {
  const rows = await prisma.quickOverviewSelection.findMany({
    where: { policyVersion: QUICK_OVERVIEW_POLICY_VERSION, sourceMarket: { in: ["CORNERS", "CARDS"] }, settledAt: { not: null }, kickoff: { gte: new Date(now.getTime() - 35 * 24 * 60 * 60_000) } },
  });
  if (!rows.length) return 0;
  const stats = await prisma.matchStatCache.findMany({
    where: { fixtureId: { in: [...new Set(rows.map((row) => row.fixtureId))] } },
    select: { fixtureId: true, teamId: true, corners: true, yellowCards: true, redCards: true },
  });
  const byFixture = new Map<number, typeof stats>();
  for (const stat of stats) byFixture.set(stat.fixtureId, [...(byFixture.get(stat.fixtureId) ?? []), stat]);
  let repaired = 0;
  for (const row of rows) {
    const unique = [...new Map((byFixture.get(row.fixtureId) ?? []).map((stat) => [stat.teamId, stat])).values()];
    const values = unique.map((stat) => row.sourceMarket === "CORNERS" ? stat.corners : stat.yellowCards == null && stat.redCards == null ? null : (stat.yellowCards ?? 0) + (stat.redCards ?? 0));
    if (values.length < 2 || values.some((value) => value == null)) continue;
    const actualCount = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const hit = quickOverviewOutcome({ market: row.sourceMarket, side: row.side, line: row.line, homeGoals: row.homeGoals, awayGoals: row.awayGoals, actualCount });
    if (hit == null || (row.hit === hit && row.actualCount === actualCount)) continue;
    await prisma.quickOverviewSelection.update({ where: { id: row.id }, data: { actualCount, hit, profit: portfolioProfit(hit, row.decimalOdds, 1), settlementStatus: "SETTLED" } });
    repaired++;
  }
  return repaired;
}

function toPredictionRow(row: FixturePrediction): PredictionRow { return { ...row, kickoff: row.kickoff.toISOString(), modelContext: row.modelContext as PredictionRow["modelContext"], published1x2Side: row.published1x2Side as PredictionRow["published1x2Side"], publishedAt: row.publishedAt?.toISOString() ?? null, h2hSnapshot: row.h2hSnapshot as PredictionRow["h2hSnapshot"], h2hCapturedAt: row.h2hCapturedAt?.toISOString() ?? null, oddsFetchedAt: row.oddsFetchedAt?.toISOString() ?? null, oddsCloseAt: row.oddsCloseAt?.toISOString() ?? null, settledAt: row.settledAt?.toISOString() ?? null } as PredictionRow; }
function isPoint(value: unknown): value is { t: number; p: number } { return typeof value === "object" && value != null && typeof (value as { p?: unknown }).p === "number"; }

function referencePrice(books: BookOdds[], picked: QuickFocusSelection) {
  const ordered = [...books].sort((a, b) => rankBook(a.id) - rankBook(b.id));
  for (const book of ordered) {
    let odds: number | null = null;
    if (picked.market === "1X2") odds = picked.side === "HOME" ? book.home : picked.side === "DRAW" ? book.draw : book.away;
    else if (picked.market === "OVER_25") odds = picked.side === "OVER" ? book.over25 : book.under25;
    else if (picked.market === "BTTS") odds = picked.side === "OVER" ? book.btts : book.bttsNo;
    else if (picked.market.startsWith("TEAM_") && picked.line != null) {
      const line = (picked.market.startsWith("TEAM_HOME") ? book.totalHome : book.totalAway)?.find((item) => item.line === picked.line);
      odds = picked.side === "OVER" ? line?.over ?? null : line?.under ?? null;
    }
    else if ((picked.market === "CORNERS" || picked.market === "CARDS") && picked.line != null) {
      const line = (picked.market === "CORNERS" ? book.corners : book.cards)?.find((item) => item.line === picked.line);
      odds = picked.side === "OVER" ? line?.over ?? null : line?.under ?? null;
    }
    if (odds != null && odds > 1) return { odds, bookmaker: book.name };
  }
  return null;
}
function rankBook(id: number) { const index = PINNACLE_FIRST_BOOKMAKERS.indexOf(id); return index < 0 ? 999 : index; }
