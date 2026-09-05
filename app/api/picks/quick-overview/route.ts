import { NextResponse } from "next/server";
import type { QuickOverviewSelection } from "@prisma/client";
import { prisma, isRealDataConfigured } from "@/lib/db";
import { getUpcomingPredictions } from "@/lib/data/repository";
import { catalogLeagueName, FIXTURE_LIST_LEAGUE_IDS, isPublicCompetition } from "@/lib/data/catalog";
import { localDateKey } from "@/lib/competitionGrouping";
import { frozenQuickSelectionReason, h2hSnapshotCount, newestFrozenQuickRows, QUICK_FOCUS_IDS, quickFocusSelection, rankQuickCandidates, restDaysBetween, selectRecentSeasonRows, type QuickCandidate, type QuickFocus, type QuickMarketSignal, type QuickScore } from "@/lib/quickOverview";
import type { PredictionRow } from "@/lib/types";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import type { ApiStandingRow } from "@/lib/data/apiFootball";
import type { ApiFixture } from "@/lib/data/apiFootball";
import { pickTeamStanding } from "@/lib/data/standings";
import { selectCurrentInjuries } from "@/lib/data/injuries";
import type { ApiInjury } from "@/lib/data/apiFootball";
import { fixtureEditorialTitle } from "@/lib/homeFeaturedFixture";
import { isEuroCupLeague } from "@/lib/data/catalog";
import { QUICK_OVERVIEW_POLICY_VERSION } from "@/lib/data/quickOverviewStore";
import { freshClosing, portfolioProfit } from "@/lib/picks/evaluation";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type RankedQuickItem = { candidate: QuickCandidate; result: QuickScore; frozenSide: string | null; frozenLine: number | null; snapshot: QuickOverviewSelection | null };

export async function GET(req: Request) {
  if (!allowRequest(`quick-overview:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Neplatné datum" }, { status: 400 });
  try {
    // V1 vznikla před sloupcem `leagueId`. Null tedy není neznámá liga: podporu
    // bezpečně ověříme přes neměnnou predikci stejného fixture.
    const frozenCandidates = isRealDataConfigured() ? await prisma.quickOverviewSelection.findMany({ where: { dateKey: date, policyVersion: { in: [1, QUICK_OVERVIEW_POLICY_VERSION] }, OR: [{ leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] } }, { leagueId: null }] }, orderBy: [{ category: "asc" }, { policyVersion: "desc" }, { rank: "asc" }] }) : [];
    const candidateIds = [...new Set(frozenCandidates.map((row) => row.fixtureId))];
    const frozenPredictions = candidateIds.length ? await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: candidateIds } } }) : [];
    const supportedFixtureIds = new Set(frozenPredictions.filter((row) => (FIXTURE_LIST_LEAGUE_IDS as readonly number[]).includes(row.leagueId)).map((row) => row.fixtureId));
    const frozen = newestFrozenQuickRows(frozenCandidates, supportedFixtureIds);
    const frozenIds = [...new Set(frozen.map((row) => row.fixtureId))];
    const predictions = frozenIds.length
      ? frozenPredictions.filter((row) => frozenIds.includes(row.fixtureId)).map(toPredictionRow)
      : (await getUpcomingPredictions()).filter((row) => row.available && isPublicCompetition(row.leagueId) && localDateKey(row.kickoff) === date);
    if (!predictions.length) return response({ date, generatedAt: new Date().toISOString(), categories: emptyCategories() });

    const [signalRows, fixtureCache, actualRows] = isRealDataConfigured() ? await Promise.all([
      prisma.marketSignalSnapshot.findMany({ where: { fixtureId: { in: predictions.map((row) => row.fixtureId) } }, orderBy: [{ openedAt: "desc" }] }),
      prisma.apiCache.findUnique({ where: { key: `fixdate:${date}` }, select: { payload: true } }),
      prisma.matchStatCache.findMany({ where: { fixtureId: { in: predictions.map((row) => row.fixtureId) } }, select: { fixtureId: true, teamId: true, corners: true, fouls: true, yellowCards: true, redCards: true } }),
    ]) : [[], null, []];
    const rounds = new Map<number, string>();
    if (Array.isArray(fixtureCache?.payload)) for (const fixture of fixtureCache.payload as unknown as ApiFixture[]) if (fixture.league.round) rounds.set(fixture.fixture.id, fixture.league.round);
    const signals = new Map<number, QuickMarketSignal[]>();
    const actualCounts = new Map<number, { corners: number | null; cards: number | null; fouls: number | null }>();
    for (const fixtureId of predictions.map((row) => row.fixtureId)) {
      const unique = [...new Map(actualRows.filter((row) => row.fixtureId === fixtureId).map((row) => [row.teamId, row])).values()];
      const sum = (pick: (row: typeof unique[number]) => number | null) => { const values = unique.map(pick); return values.length >= 2 && values.every((value) => value != null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null; };
      actualCounts.set(fixtureId, { corners: sum((row) => row.corners), fouls: sum((row) => row.fouls), cards: sum((row) => row.yellowCards == null && row.redCards == null ? null : (row.yellowCards ?? 0) + (row.redCards ?? 0)) });
    }
    for (const item of signalRows) {
      const list = signals.get(item.fixtureId) ?? [];
      if (list.some((existing) => existing.market === item.market)) continue;
      const points = Array.isArray(item.series) ? item.series.filter(isSeriesPoint) : [];
      list.push({
        market: item.market as QuickMarketSignal["market"],
        side: item.side as QuickMarketSignal["side"],
        line: item.line,
        modelProbability: item.modelProbability,
        openMarketProbability: item.openMarketProbability,
        currentMarketProbability: points.at(-1)?.p ?? item.closeMarketProbability ?? item.openMarketProbability,
        // `sampleAttempts` zahrnuje i neúspěšné dotazy. Pro důvěryhodnost trhu počítáme
        // jen skutečně uložené srovnatelné body časové řady.
        samples: points.length,
      });
      signals.set(item.fixtureId, list);
    }

    const candidates: QuickCandidate[] = predictions.map((row) => ({ row, signals: signals.get(row.fixtureId) ?? [] }));
    const byFixture = new Map(candidates.map((candidate) => [candidate.row.fixtureId, candidate]));
    const ranked = (frozen.length
      ? Object.fromEntries(QUICK_FOCUS_IDS.map((focus) => [focus, frozen.filter((item) => item.category === focus).flatMap((item) => {
          const candidate = byFixture.get(item.fixtureId);
          return candidate ? [{ candidate, result: { score: item.score, reason: frozenQuickSelectionReason(item, candidate), modelProbability: item.modelProbability, marketProbability: item.marketProbability, marketMove: item.marketMove, marketSamples: item.marketSamples, experimental: candidate.row.modelContext === "EURO_CUP" } satisfies QuickScore, frozenSide: item.side, frozenLine: item.line, snapshot: item }] : [];
        })]))
      : Object.fromEntries(QUICK_FOCUS_IDS.map((focus) => [focus, rankQuickCandidates(candidates, focus).map((item) => ({ ...item, frozenSide: null, frozenLine: null, snapshot: null }))]))) as Record<QuickFocus, RankedQuickItem[]>;
    const selectedIds = [...new Set(Object.values(ranked).flatMap((items) => items.map((item) => item.candidate.row.fixtureId)))];
    const selected = candidates.filter((candidate) => selectedIds.includes(candidate.row.fixtureId));
    const contexts = await buildContexts(selected);

    const categories = Object.fromEntries(QUICK_FOCUS_IDS.map((focus) => [focus, ranked[focus].map((item, index) => {
      const row = item.candidate.row;
      const close = item.snapshot ? freshClosing(new Date(row.kickoff), item.snapshot.closedAt, item.snapshot.closingMarketProbability).close : null;
      const hit = item.snapshot?.hit ?? selectionHit(focus, row, item.candidate.signals, actualCounts.get(row.fixtureId) ?? null, item.frozenSide, item.frozenLine, item.snapshot?.sourceMarket ?? null);
      const profit = focus === "team_goals" ? null : item.snapshot?.profit ?? portfolioProfit(hit, item.snapshot?.decimalOdds ?? null);
      return {
        rank: index + 1,
        fixtureId: row.fixtureId,
        kickoff: row.kickoff,
        leagueId: row.leagueId,
        leagueName: catalogLeagueName(row.leagueId, `Soutěž ${row.leagueId}`),
        round: rounds.get(row.fixtureId) ?? null,
        editorialTitle: fixtureEditorialTitle(row.homeName, row.awayName, isEuroCupLeague(row.leagueId)),
        home: { id: row.homeTeamId, name: row.homeName, logoUrl: row.homeLogo },
        away: { id: row.awayTeamId, name: row.awayName, logoUrl: row.awayLogo },
        expectedScore: { home: row.lambdaHome, away: row.lambdaAway },
        matchState: row.status === "FT" || row.status === "AET" || row.status === "PEN" ? "settled" : ["1H", "HT", "2H", "ET", "BT", "P"].includes(row.status) ? "live" : "pending",
        result: row.homeGoals == null || row.awayGoals == null ? null : { home: row.homeGoals, away: row.awayGoals, hit, actualCounts: actualCounts.get(row.fixtureId) ?? null },
        probabilities: { home: row.homeWin, draw: row.draw, away: row.awayWin, over25: row.over25, btts: row.bttsYes },
        counts: {
          corners: total(row.lambdaCornersHome, row.lambdaCornersAway),
          cards: total(row.lambdaCardsHome, row.lambdaCardsAway),
          cardsBeforeReferee: total(row.lambdaCardsHomeBeforeRef, row.lambdaCardsAwayBeforeRef),
          fouls: total(row.lambdaFoulsHome, row.lambdaFoulsAway),
        },
        lowConfidence: row.lowConfidence,
        readinessSample: row.readinessSample,
        referee: row.refereeName ? { name: row.refereeName, factor: row.refereeFactor ?? null, sample: row.refereeSample ?? 0 } : null,
        h2hMeetings: h2hSnapshotCount(row.h2hSnapshot),
        marketSignals: item.candidate.signals,
        audit: item.snapshot ? { policyVersion: item.snapshot.policyVersion, sourceMarket: item.snapshot.sourceMarket, side: item.snapshot.side, line: item.snapshot.line, decimalOdds: item.snapshot.decimalOdds, bookmaker: item.snapshot.bookmaker, marketProbability: item.snapshot.marketProbability, closingMarketProbability: close, clv: close == null || item.snapshot.marketProbability == null ? null : close - item.snapshot.marketProbability, profit } : null,
        ...item.result,
        context: contexts.get(row.fixtureId) ?? null,
      };
    })]));
    const summaries = Object.fromEntries(QUICK_FOCUS_IDS.map((focus) => [focus, dailySummary(categories[focus], focus === "team_goals")]));
    return response({ date, generatedAt: new Date().toISOString(), categories, summaries });
  } catch (error) {
    logError("api/picks/quick-overview", error, { date });
    return NextResponse.json({ error: "Rychlý přehled se nepodařilo načíst" }, { status: 502 });
  }
}

function toPredictionRow(row: Awaited<ReturnType<typeof prisma.fixturePrediction.findMany>>[number]): PredictionRow {
  return { ...row, kickoff: row.kickoff.toISOString(), modelContext: row.modelContext as PredictionRow["modelContext"], published1x2Side: row.published1x2Side as PredictionRow["published1x2Side"], publishedAt: row.publishedAt?.toISOString() ?? null, h2hSnapshot: row.h2hSnapshot as PredictionRow["h2hSnapshot"], h2hCapturedAt: row.h2hCapturedAt?.toISOString() ?? null, oddsFetchedAt: row.oddsFetchedAt?.toISOString() ?? null, oddsCloseAt: row.oddsCloseAt?.toISOString() ?? null, settledAt: row.settledAt?.toISOString() ?? null } as PredictionRow;
}

function selectionHit(focus: string, row: PredictionRow, signals: QuickMarketSignal[], actual: { corners: number | null; cards: number | null } | null, frozenSide: string | null, frozenLine: number | null, frozenMarket: string | null): boolean | null {
  if (row.homeGoals == null || row.awayGoals == null) return null;
  if (focus === "1x2") { const side = frozenSide ?? (row.homeWin >= row.awayWin ? "HOME" : "AWAY"); return side === "HOME" ? row.homeGoals > row.awayGoals : side === "AWAY" ? row.awayGoals > row.homeGoals : row.homeGoals === row.awayGoals; }
  if (focus === "goals") { const side = frozenSide ?? (row.over25 >= 0.5 ? "OVER" : "UNDER"); return side === "OVER" ? row.homeGoals + row.awayGoals > 2.5 : row.homeGoals + row.awayGoals < 2.5; }
  if (focus === "btts") { const side = frozenSide ?? (row.bttsYes >= 0.5 ? "OVER" : "UNDER"); const both = row.homeGoals > 0 && row.awayGoals > 0; return side === "OVER" ? both : !both; }
  if (focus === "team_goals") { const picked = frozenMarket ? { market: frozenMarket, line: frozenLine } : quickFocusSelection({ row, signals }, "team_goals"); if (!picked || picked.line == null) return null; return (picked.market.startsWith("TEAM_HOME") ? row.homeGoals : row.awayGoals) > picked.line; }
  if (focus === "corners" || focus === "cards") { const signal = signals.find((item) => item.market === (focus === "corners" ? "CORNERS" : "CARDS")); const side = frozenSide ?? signal?.side; const line = frozenLine ?? signal?.line; const count = focus === "corners" ? actual?.corners : actual?.cards; if (!side || line == null || count == null) return null; return side === "OVER" ? count > line : count < line; }
  return null;
}

function response(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}

function emptyCategories() {
  return Object.fromEntries(QUICK_FOCUS_IDS.map((focus) => [focus, []]));
}

function isSeriesPoint(value: unknown): value is { t: number; p: number } {
  return typeof value === "object" && value != null && typeof (value as { t?: unknown }).t === "number" && typeof (value as { p?: unknown }).p === "number";
}

function total(home: number | null | undefined, away: number | null | undefined) {
  return home == null || away == null ? null : home + away;
}

function dailySummary(items: Array<{ result: { hit: boolean | null } | null; audit: { decimalOdds: number | null; profit: number | null } | null }>, diagnostic: boolean) {
  const settled = items.filter((item) => item.result?.hit != null);
  const priced = diagnostic ? [] : settled.filter((item) => item.audit?.decimalOdds != null && item.audit.profit != null);
  const profit = priced.reduce((sum, item) => sum + (item.audit?.profit ?? 0), 0);
  return { total: items.length, settled: settled.length, hits: settled.filter((item) => item.result?.hit).length, priced: priced.length, profit, roi: priced.length ? profit / priced.length : null, diagnostic };
}

async function buildContexts(candidates: QuickCandidate[]) {
  const out = new Map<number, ReturnType<typeof contextFor>>();
  if (!isRealDataConfigured() || !candidates.length) return out;
  const teamIds = [...new Set(candidates.flatMap(({ row }) => [row.homeTeamId, row.awayTeamId]))];
  const leagueIds = [...new Set(candidates.map(({ row }) => row.leagueId))];
  const seasons = [...new Set(candidates.map(({ row }) => row.season))];
  const latestKickoff = new Date(Math.max(...candidates.map(({ row }) => new Date(row.kickoff).getTime())));
  const [stats, standingsCache, injuryCache] = await Promise.all([
    prisma.matchStatCache.findMany({
      where: { teamId: { in: teamIds }, season: { in: seasons }, competitive: true, date: { lt: latestKickoff }, schemaVersion: { gte: 2 } },
      orderBy: { date: "desc" },
      select: { teamId: true, season: true, fixtureId: true, date: true, goalsFor: true, goalsAgainst: true, xg: true, xgAgainst: true, isHome: true, isNeutral: true, opponentName: true, opponentLogo: true },
    }),
    prisma.apiCache.findMany({
      where: { OR: leagueIds.map((leagueId) => ({ key: { startsWith: `standings:${leagueId}:` } })) },
      orderBy: { updatedAt: "desc" },
      select: { key: true, payload: true, updatedAt: true },
    }),
    prisma.apiCache.findMany({
      where: { OR: teamIds.map((teamId) => ({ key: { startsWith: `inj:${teamId}:` } })) },
      orderBy: { updatedAt: "desc" },
      select: { key: true, payload: true, updatedAt: true },
    }),
  ]);
  const statsByTeam = new Map<number, typeof stats>();
  for (const row of stats) {
    const rows = statsByTeam.get(row.teamId) ?? [];
    rows.push(row);
    statsByTeam.set(row.teamId, rows);
  }
  const standingsByLeague = new Map<number, { rows: ApiStandingRow[]; updatedAt: Date }>();
  for (const cache of standingsCache) {
    const leagueId = Number(cache.key.split(":")[1]);
    if (!standingsByLeague.has(leagueId) && Array.isArray(cache.payload)) standingsByLeague.set(leagueId, { rows: cache.payload as unknown as ApiStandingRow[], updatedAt: cache.updatedAt });
  }
  const injuriesByTeam = new Map<number, { rows: ReturnType<typeof selectCurrentInjuries>; updatedAt: Date }>();
  for (const cache of injuryCache) {
    const teamId = Number(cache.key.split(":")[1]);
    if (!injuriesByTeam.has(teamId) && Array.isArray(cache.payload)) injuriesByTeam.set(teamId, { rows: selectCurrentInjuries(cache.payload as unknown as ApiInjury[]), updatedAt: cache.updatedAt });
  }
  for (const candidate of candidates) {
    const row = candidate.row;
    const table = standingsByLeague.get(row.leagueId);
    const homeRows = selectRecentSeasonRows(statsByTeam.get(row.homeTeamId) ?? [], row.homeTeamId, row.season, row.kickoff);
    const awayRows = selectRecentSeasonRows(statsByTeam.get(row.awayTeamId) ?? [], row.awayTeamId, row.season, row.kickoff);
    out.set(row.fixtureId, contextFor(row.kickoff, homeRows, awayRows, table ? pickTeamStanding(table.rows, row.homeTeamId) : null, table ? pickTeamStanding(table.rows, row.awayTeamId) : null, table?.updatedAt ?? null, injuriesByTeam.get(row.homeTeamId) ?? null, injuriesByTeam.get(row.awayTeamId) ?? null));
  }
  return out;
}

type RecentRow = { teamId: number; season: number; fixtureId: number; date: Date; goalsFor: number | null; goalsAgainst: number | null; xg: number | null; xgAgainst: number | null; isHome: boolean; isNeutral: boolean; opponentName: string | null; opponentLogo: string | null };

function contextFor(kickoff: string, homeRows: RecentRow[], awayRows: RecentRow[], homeStanding: ReturnType<typeof pickTeamStanding>, awayStanding: ReturnType<typeof pickTeamStanding>, standingsUpdatedAt: Date | null, homeInjuries: { rows: ReturnType<typeof selectCurrentInjuries>; updatedAt: Date } | null, awayInjuries: { rows: ReturnType<typeof selectCurrentInjuries>; updatedAt: Date } | null) {
  const home = teamContext(kickoff, homeRows, homeStanding, homeInjuries);
  const away = teamContext(kickoff, awayRows, awayStanding, awayInjuries);
  const restDifference = home.restDays != null && away.restDays != null ? home.restDays - away.restDays : null;
  const available = [home.form.length > 0, away.form.length > 0, home.standing != null, away.standing != null, home.restDays != null, away.restDays != null].filter(Boolean).length;
  return { home, away, restDifference, restRelevant: restDifference != null && Math.abs(restDifference) >= 2, completeness: Math.round(available / 6 * 100), standingsUpdatedAt: standingsUpdatedAt?.toISOString() ?? null };
}

function teamContext(kickoff: string, rows: RecentRow[], standing: ReturnType<typeof pickTeamStanding>, injuries: { rows: ReturnType<typeof selectCurrentInjuries>; updatedAt: Date } | null) {
  const form = rows.slice(0, 5).map((row) => ({
    fixtureId: row.fixtureId, date: row.date.toISOString(), opponent: row.opponentName,
    result: row.goalsFor == null || row.goalsAgainst == null ? null : row.goalsFor > row.goalsAgainst ? "W" : row.goalsFor < row.goalsAgainst ? "L" : "D",
    goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, xgFor: row.xg, xgAgainst: row.xgAgainst,
    opponentLogo: row.opponentLogo, venue: row.isNeutral ? "NEUTRAL" : row.isHome ? "HOME" : "AWAY",
  }));
  const points = form.reduce((sum, item) => sum + (item.result === "W" ? 3 : item.result === "D" ? 1 : 0), 0);
  const xgRows = form.filter((item) => item.xgFor != null && item.xgAgainst != null);
  const xgDiff = xgRows.length ? xgRows.reduce((sum, item) => sum + item.xgFor! - item.xgAgainst!, 0) / xgRows.length : null;
  const ppg = standing?.all.played ? standing.points / standing.all.played : null;
  const parts = [{ value: form.length ? points / (form.length * 3) : null, weight: .5 }, { value: xgDiff == null ? null : Math.max(0, Math.min(1, .5 + xgDiff / 2)), weight: .3 }, { value: ppg == null ? null : Math.max(0, Math.min(1, ppg / 3)), weight: .2 }].filter((item): item is { value: number; weight: number } => item.value != null);
  const formScore = form.length >= 3 && parts.length ? parts.reduce((sum, item) => sum + item.value * item.weight, 0) / parts.reduce((sum, item) => sum + item.weight, 0) * 10 : null;
  const last = rows[0]?.date;
  const restDays = restDaysBetween(last ?? null, kickoff);
  return {
    form, formScore, points, xgDiff, restDays,
    cleanSheetPct: rate(form, (match) => match.goalsAgainst === 0),
    failedToScorePct: rate(form, (match) => match.goalsFor === 0),
    standing: standing ? {
      rank: standing.rank, points: standing.points, played: standing.all.played, ppg,
      home: splitSummary(standing.home), away: splitSummary(standing.away),
    } : null,
    injuries: injuries?.rows ?? null,
    injuriesUpdatedAt: injuries?.updatedAt.toISOString() ?? null,
  };
}

function rate<T>(rows: T[], predicate: (row: T) => boolean) {
  return rows.length ? rows.filter(predicate).length / rows.length : null;
}

function splitSummary(split: { played: number; win: number; draw: number; lose: number; goalsFor: number; goalsAgainst: number }) {
  return { ...split, points: split.win * 3 + split.draw, ppg: split.played ? (split.win * 3 + split.draw) / split.played : null };
}
