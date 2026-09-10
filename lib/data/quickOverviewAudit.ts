import "server-only";
import { prisma } from "@/lib/db";
import { FIXTURE_LIST_LEAGUE_IDS, isPublicCompetition, isWomensCompetitionLabel } from "./catalog";
import type { ApiFixture } from "./apiFootball";
import { localDateKey } from "@/lib/competitionGrouping";
import { QUICK_FOCUS_IDS, rankQuickCandidates, type QuickCandidate, type QuickFocus, type QuickMarketSignal } from "@/lib/quickOverview";
import type { PredictionRow } from "@/lib/types";
import { QUICK_OVERVIEW_POLICY_VERSION } from "./quickOverviewStore";

type Rejection = "FROZEN" | "MISSING_ODDS" | "NOT_CAPTURED";

export async function quickOverviewCaptureAudit(now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  let predictions = await prisma.fixturePrediction.findMany({
    where: { available: true, leagueId: { in: [...FIXTURE_LIST_LEAGUE_IDS] }, kickoff: { gte: since, lte: now } },
    orderBy: { kickoff: "asc" },
  });
  const dateKeys = [...new Set(predictions.map((row) => localDateKey(row.kickoff)))];
  const caches = dateKeys.length ? await prisma.apiCache.findMany({
    where: { key: { in: dateKeys.flatMap((date) => [`fixdate:${date}`, `fixdate-now:${date}`]) } }, orderBy: { updatedAt: "desc" }, select: { key: true, payload: true },
  }) : [];
  const officialByDate = new Map<string, Set<number>>();
  for (const cache of caches) {
    const date = cache.key.split(":").at(-1)!;
    if (officialByDate.has(date) || !Array.isArray(cache.payload)) continue;
    officialByDate.set(date, new Set((cache.payload as unknown as ApiFixture[]).filter((fixture) =>
      isPublicCompetition(fixture.league.id) && !isWomensCompetitionLabel(fixture.league.name, fixture.league.round, fixture.teams.home.name, fixture.teams.away.name)
    ).map((fixture) => fixture.fixture.id)));
  }
  predictions = predictions.filter((row) => {
    const official = officialByDate.get(localDateKey(row.kickoff));
    return !official || official.has(row.fixtureId);
  });
  const fixtureIds = predictions.map((row) => row.fixtureId);
  const [signalRows, frozenRows] = fixtureIds.length ? await Promise.all([
    prisma.marketSignalSnapshot.findMany({ where: { fixtureId: { in: fixtureIds } }, orderBy: { openedAt: "desc" } }),
    prisma.quickOverviewSelection.findMany({ where: { fixtureId: { in: fixtureIds }, policyVersion: QUICK_OVERVIEW_POLICY_VERSION } }),
  ]) : [[], []];
  const signals = new Map<number, QuickMarketSignal[]>();
  for (const row of signalRows) {
    const list = signals.get(row.fixtureId) ?? [];
    if (list.some((item) => item.market === row.market)) continue;
    const points = Array.isArray(row.series) ? row.series.filter(isPoint) : [];
    list.push({
      market: row.market as QuickMarketSignal["market"], side: row.side as QuickMarketSignal["side"], line: row.line,
      modelProbability: row.modelProbability, openMarketProbability: row.openMarketProbability,
      currentMarketProbability: points.at(-1)?.p ?? row.closeMarketProbability ?? row.openMarketProbability,
      samples: points.length,
    });
    signals.set(row.fixtureId, list);
  }
  const frozen = new Set(frozenRows.map((row) => `${row.dateKey}:${row.category}:${row.fixtureId}`));
  const dates = [...new Set(predictions.map((row) => localDateKey(row.kickoff)))].sort().reverse();
  const detail = dates.map((date) => {
    const rows = predictions.filter((row) => localDateKey(row.kickoff) === date);
    const candidates: QuickCandidate[] = rows.map((row) => ({ row: toPredictionRow(row), signals: signals.get(row.fixtureId) ?? [] }));
    const categories = QUICK_FOCUS_IDS.map((category) => {
      const qualified = rankQuickCandidates(candidates, category);
      const results = qualified.map(({ candidate }) => {
        const key = `${date}:${category}:${candidate.row.fixtureId}`;
        const source = rows.find((row) => row.fixtureId === candidate.row.fixtureId)!;
        const status: Rejection = frozen.has(key) ? "FROZEN" : !source.oddsFetchedAt || !source.oddsBooks ? "MISSING_ODDS" : "NOT_CAPTURED";
        return { fixtureId: candidate.row.fixtureId, match: `${candidate.row.homeName} – ${candidate.row.awayName}`, status };
      });
      return { category, qualified: results.length, frozen: results.filter((row) => row.status === "FROZEN").length, missingOdds: results.filter((row) => row.status === "MISSING_ODDS").length, notCaptured: results.filter((row) => row.status === "NOT_CAPTURED").length, examples: results.filter((row) => row.status !== "FROZEN").slice(0, 3) };
    });
    return { date, fixtures: rows.length, categories };
  });
  const flat = detail.flatMap((day) => day.categories);
  return {
    periodStart: since, periodEnd: now,
    eligibleFixtures: predictions.length,
    qualified: flat.reduce((sum, row) => sum + row.qualified, 0),
    frozen: flat.reduce((sum, row) => sum + row.frozen, 0),
    missingOdds: flat.reduce((sum, row) => sum + row.missingOdds, 0),
    notCaptured: flat.reduce((sum, row) => sum + row.notCaptured, 0),
    days: detail,
  };
}

function isPoint(value: unknown): value is { t: number; p: number } {
  return typeof value === "object" && value != null && typeof (value as { p?: unknown }).p === "number";
}

function toPredictionRow(row: Awaited<ReturnType<typeof prisma.fixturePrediction.findMany>>[number]): PredictionRow {
  return { ...row, kickoff: row.kickoff.toISOString(), modelContext: row.modelContext as PredictionRow["modelContext"], published1x2Side: row.published1x2Side as PredictionRow["published1x2Side"], publishedAt: row.publishedAt?.toISOString() ?? null, h2hSnapshot: row.h2hSnapshot as PredictionRow["h2hSnapshot"], h2hCapturedAt: row.h2hCapturedAt?.toISOString() ?? null, oddsFetchedAt: row.oddsFetchedAt?.toISOString() ?? null, oddsCloseAt: row.oddsCloseAt?.toISOString() ?? null, settledAt: row.settledAt?.toISOString() ?? null } as PredictionRow;
}

export function quickFocusAuditLabel(focus: QuickFocus) {
  return focus === "1x2" ? "1X2" : focus === "goals" ? "Góly" : focus === "btts" ? "BTTS" : focus === "team_goals" ? "Týmové góly" : focus === "corners" ? "Rohy" : "Karty";
}
