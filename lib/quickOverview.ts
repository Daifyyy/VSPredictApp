import type { PredictionRow } from "@/lib/types";

export const QUICK_FOCUS_IDS = ["1x2", "goals", "btts", "corners", "cards", "market"] as const;
export type QuickFocus = (typeof QUICK_FOCUS_IDS)[number];

export const QUICK_FOCUS_LABELS: Record<QuickFocus, string> = {
  "1x2": "Výsledek 1X2",
  goals: "Góly Over/Under 2,5",
  btts: "Oba týmy skórují",
  corners: "Rohy",
  cards: "Karty a rozhodčí",
  market: "Pohyb trhu",
};

export interface QuickMarketSignal {
  market: "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS";
  side: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";
  line: number | null;
  modelProbability: number;
  openMarketProbability: number;
  currentMarketProbability: number;
  samples: number;
}

export interface QuickCandidate {
  row: PredictionRow;
  signals: QuickMarketSignal[];
}

export interface QuickScore {
  score: number;
  reason: string;
  modelProbability: number | null;
  marketProbability: number | null;
  marketMove: number | null;
  marketSamples: number;
  experimental: boolean;
}

const pct = (value: number) => `${Math.round(value * 100)} %`;
const pp = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)} p. b.`;
const reliability = (row: PredictionRow) => Math.min(1, Math.max(0, row.readinessSample / 10));
const penalty = (row: PredictionRow) => row.lowConfidence ? 0.82 : 1;

function signal(candidate: QuickCandidate, market: QuickMarketSignal["market"]) {
  return candidate.signals.find((item) => item.market === market) ?? null;
}

export function scoreQuickCandidate(candidate: QuickCandidate, focus: QuickFocus): QuickScore | null {
  const { row } = candidate;
  const ready = reliability(row);
  const confidence = penalty(row);
  const make = (score: number, reason: string, model: number | null, market: number | null, move: number | null, samples = 0): QuickScore => ({
    score: score * confidence,
    reason,
    modelProbability: model,
    marketProbability: market,
    marketMove: move,
    marketSamples: samples,
    experimental: row.modelContext === "EURO_CUP",
  });

  if (focus === "1x2") {
    const ordered = [
      { side: "Domácí", value: row.homeWin },
      { side: "Hosté", value: row.awayWin },
      { side: "Remíza", value: row.draw },
    ].sort((a, b) => b.value - a.value);
    const best = ordered[0];
    if (best.side === "Remíza") return null;
    const gap = best.value - ordered[1].value;
    const marketSignal = signal(candidate, "1X2");
    return make(best.value * 0.65 + gap * 0.25 + ready * 0.1, `${best.side} ${pct(best.value)} · náskok ${Math.round(gap * 100)} p. b.`, best.value, marketSignal?.openMarketProbability ?? null, marketSignal ? marketSignal.currentMarketProbability - marketSignal.openMarketProbability : null, marketSignal?.samples ?? 0);
  }

  if (focus === "goals") {
    const over = row.over25;
    const model = Math.max(over, 1 - over);
    const side = over >= 0.5 ? "Over 2,5" : "Under 2,5";
    const marketSignal = signal(candidate, "OVER_25");
    return make(model * 0.85 + ready * 0.15, `${side} · ${pct(model)}`, model, marketSignal?.openMarketProbability ?? null, marketSignal ? marketSignal.currentMarketProbability - marketSignal.openMarketProbability : null, marketSignal?.samples ?? 0);
  }

  if (focus === "btts") {
    const yes = row.bttsYes;
    const model = Math.max(yes, 1 - yes);
    const side = yes >= 0.5 ? "Oba skórují – Ano" : "Oba skórují – Ne";
    const marketSignal = signal(candidate, "BTTS");
    return make(model * 0.85 + ready * 0.15, `${side} · ${pct(model)}`, model, marketSignal?.openMarketProbability ?? null, marketSignal ? marketSignal.currentMarketProbability - marketSignal.openMarketProbability : null, marketSignal?.samples ?? 0);
  }

  if (focus === "corners" || focus === "cards") {
    const marketSignal = signal(candidate, focus === "corners" ? "CORNERS" : "CARDS");
    if (!marketSignal || marketSignal.line == null) return null;
    const model = Math.max(marketSignal.modelProbability, 1 - marketSignal.modelProbability);
    const side = marketSignal.modelProbability >= 0.5 ? "Over" : "Under";
    const referee = focus === "cards" && row.refereeSample && row.refereeSample >= 10
      ? ` · rozhodčí ${row.refereeFactor && row.refereeFactor > 1.03 ? "zvyšuje" : row.refereeFactor && row.refereeFactor < 0.97 ? "snižuje" : "neutrální"}`
      : "";
    return make(model * 0.7 + Math.min(marketSignal.samples, 5) / 5 * 0.15 + ready * 0.15, `${side} ${marketSignal.line.toFixed(1)} · ${pct(model)}${referee}`, model, marketSignal.openMarketProbability, marketSignal.currentMarketProbability - marketSignal.openMarketProbability, marketSignal.samples);
  }

  if (focus === "market") {
    const eligible = candidate.signals.filter((item) => item.samples >= 3);
    if (!eligible.length) return null;
    const best = eligible.sort((a, b) => Math.abs(b.modelProbability - b.currentMarketProbability) - Math.abs(a.modelProbability - a.currentMarketProbability))[0];
    const edge = best.modelProbability - best.currentMarketProbability;
    const move = best.currentMarketProbability - best.openMarketProbability;
    return make(Math.abs(edge) * 0.75 + Math.min(best.samples, 6) / 6 * 0.15 + ready * 0.1, `${marketLabel(best.market)} · model vs. trh ${pp(edge)}`, best.modelProbability, best.currentMarketProbability, move, best.samples);
  }

  return null;
}

function marketLabel(market: QuickMarketSignal["market"]) {
  return market === "1X2" ? "1X2" : market === "OVER_25" ? "Góly" : market === "BTTS" ? "Oba skórují" : market === "CORNERS" ? "Rohy" : "Karty";
}

export function rankQuickCandidates(candidates: QuickCandidate[], focus: QuickFocus, limit = 3) {
  return candidates
    .map((candidate) => ({ candidate, result: scoreQuickCandidate(candidate, focus) }))
    .filter((item): item is { candidate: QuickCandidate; result: QuickScore } => item.result != null)
    .sort((a, b) => b.result.score - a.result.score || b.candidate.row.readinessSample - a.candidate.row.readinessSample || a.candidate.row.kickoff.localeCompare(b.candidate.row.kickoff) || a.candidate.row.fixtureId - b.candidate.row.fixtureId)
    .slice(0, limit);
}

/** Celé dokončené 24hodinové bloky mezi posledním zápasem a novým výkopem. */
export function restDaysBetween(lastMatch: string | Date | null, kickoff: string | Date): number | null {
  if (lastMatch == null) return null;
  const start = new Date(lastMatch).getTime();
  const end = new Date(kickoff).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/** Selects current-season form that was known before the compared kickoff. */
export function selectRecentSeasonRows<T extends { teamId: number; season: number; date: Date }>(
  rows: T[],
  teamId: number,
  season: number,
  kickoff: string | Date,
  limit = 5
): T[] {
  const before = new Date(kickoff).getTime();
  return rows
    .filter((row) => row.teamId === teamId && row.season === season && row.date.getTime() < before)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}

/** Supports both a full H2H response and its immutable prediction snapshot. */
export function h2hSnapshotCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const snapshot = value as { sample?: unknown; meetings?: unknown };
  if (typeof snapshot.sample === "number" && Number.isFinite(snapshot.sample)) {
    return Math.max(0, Math.floor(snapshot.sample));
  }
  return Array.isArray(snapshot.meetings) ? snapshot.meetings.length : 0;
}
