import { NextResponse } from "next/server";
import { prisma, isRealDataConfigured } from "@/lib/db";
import { getUpcomingPredictions } from "@/lib/data/repository";
import { catalogLeagueName, isPublicCompetition } from "@/lib/data/catalog";
import { localDateKey } from "@/lib/competitionGrouping";
import { h2hSnapshotCount, QUICK_FOCUS_IDS, rankQuickCandidates, restDaysBetween, selectRecentSeasonRows, type QuickCandidate, type QuickMarketSignal } from "@/lib/quickOverview";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import type { ApiStandingRow } from "@/lib/data/apiFootball";
import type { ApiFixture } from "@/lib/data/apiFootball";
import { pickTeamStanding } from "@/lib/data/standings";
import { selectCurrentInjuries } from "@/lib/data/injuries";
import type { ApiInjury } from "@/lib/data/apiFootball";
import { fixtureEditorialTitle } from "@/lib/homeFeaturedFixture";
import { isEuroCupLeague } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  if (!allowRequest(`quick-overview:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Neplatné datum" }, { status: 400 });
  try {
    const predictions = (await getUpcomingPredictions())
      .filter((row) => row.available && isPublicCompetition(row.leagueId) && localDateKey(row.kickoff) === date);
    if (!predictions.length) return response({ date, generatedAt: new Date().toISOString(), categories: emptyCategories() });

    const [signalRows, fixtureCache] = isRealDataConfigured() ? await Promise.all([
      prisma.marketSignalSnapshot.findMany({ where: { fixtureId: { in: predictions.map((row) => row.fixtureId) } }, orderBy: [{ openedAt: "desc" }] }),
      prisma.apiCache.findUnique({ where: { key: `fixdate:${date}` }, select: { payload: true } }),
    ]) : [[], null];
    const rounds = new Map<number, string>();
    if (Array.isArray(fixtureCache?.payload)) for (const fixture of fixtureCache.payload as unknown as ApiFixture[]) if (fixture.league.round) rounds.set(fixture.fixture.id, fixture.league.round);
    const signals = new Map<number, QuickMarketSignal[]>();
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
    const ranked = Object.fromEntries(QUICK_FOCUS_IDS.map((focus) => [focus, rankQuickCandidates(candidates, focus)]));
    const selectedIds = [...new Set(Object.values(ranked).flatMap((items) => items.map((item) => item.candidate.row.fixtureId)))];
    const selected = candidates.filter((candidate) => selectedIds.includes(candidate.row.fixtureId));
    const contexts = await buildContexts(selected);

    const categories = Object.fromEntries(QUICK_FOCUS_IDS.map((focus) => [focus, ranked[focus].map((item, index) => {
      const row = item.candidate.row;
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
        ...item.result,
        context: contexts.get(row.fixtureId) ?? null,
      };
    })]));
    return response({ date, generatedAt: new Date().toISOString(), categories });
  } catch (error) {
    logError("api/picks/quick-overview", error, { date });
    return NextResponse.json({ error: "Rychlý přehled se nepodařilo načíst" }, { status: 502 });
  }
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
