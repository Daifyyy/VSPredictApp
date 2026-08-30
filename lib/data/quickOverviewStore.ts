import type { FixturePrediction } from "@prisma/client";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/competitionGrouping";
import { QUICK_FOCUS_IDS, rankQuickCandidates, type QuickCandidate, type QuickMarketSignal } from "@/lib/quickOverview";
import type { PredictionRow } from "@/lib/types";
import { pragueDateBounds } from "@/lib/recentWindow";

const POLICY_VERSION = 1;

/** Zmrazi prvni kvalitni denni vyber. Volat pouze z kurzoveho cronu. */
export async function captureQuickOverviewDay(fixtureId: number, at: Date): Promise<void> {
  const trigger = await prisma.fixturePrediction.findUnique({ where: { fixtureId } });
  if (!trigger?.available || trigger.kickoff <= at) return;
  const dateKey = localDateKey(trigger.kickoff);
  const frozenCategories = new Set((await prisma.quickOverviewSelection.findMany({ where: { dateKey, policyVersion: POLICY_VERSION }, select: { category: true } })).map((row) => row.category));
  if (frozenCategories.size === QUICK_FOCUS_IDS.length) return;

  const bounds = pragueDateBounds(dateKey);
  const rows = await prisma.fixturePrediction.findMany({ where: { kickoff: { gte: bounds.start, lt: bounds.end }, available: true } });
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
  const creates = QUICK_FOCUS_IDS.filter((category) => !frozenCategories.has(category)).flatMap((category) => rankQuickCandidates(candidates, category).map(({ candidate, result }, index) => {
    const picked = categorySignal(candidate, category);
    return { dateKey, category, fixtureId: candidate.row.fixtureId, rank: index + 1, reason: result.reason, score: result.score, modelProbability: result.modelProbability, marketProbability: result.marketProbability, marketMove: result.marketMove, marketSamples: result.marketSamples, side: picked?.side ?? null, line: picked?.line ?? null, modelVersion: candidate.row.modelVersion, contextVersion: candidate.row.contextVersion ?? 1, policyVersion: POLICY_VERSION, lowConfidence: candidate.row.lowConfidence, readinessSample: candidate.row.readinessSample, qualifiedAt: at };
  }));
  if (creates.length) await prisma.quickOverviewSelection.createMany({ data: creates, skipDuplicates: true });
}

function toPredictionRow(row: FixturePrediction): PredictionRow { return { ...row, kickoff: row.kickoff.toISOString(), modelContext: row.modelContext as PredictionRow["modelContext"], published1x2Side: row.published1x2Side as PredictionRow["published1x2Side"], publishedAt: row.publishedAt?.toISOString() ?? null, h2hSnapshot: row.h2hSnapshot as PredictionRow["h2hSnapshot"], h2hCapturedAt: row.h2hCapturedAt?.toISOString() ?? null, oddsFetchedAt: row.oddsFetchedAt?.toISOString() ?? null, oddsCloseAt: row.oddsCloseAt?.toISOString() ?? null, settledAt: row.settledAt?.toISOString() ?? null } as PredictionRow; }
function isPoint(value: unknown): value is { t: number; p: number } { return typeof value === "object" && value != null && typeof (value as { p?: unknown }).p === "number"; }
function categorySignal(candidate: QuickCandidate, category: string) { const market = category === "goals" ? "OVER_25" : category === "btts" ? "BTTS" : category === "corners" ? "CORNERS" : category === "cards" ? "CARDS" : category === "1x2" ? "1X2" : null; return market ? candidate.signals.find((item) => item.market === market) : null; }
