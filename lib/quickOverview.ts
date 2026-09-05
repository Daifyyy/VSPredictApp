import type { PredictionRow } from "@/lib/types";
import { teamTotalProb } from "@/lib/picks/teamTotals";

export const QUICK_FOCUS_IDS = ["1x2", "goals", "btts", "team_goals", "corners", "cards"] as const;
export type QuickFocus = (typeof QUICK_FOCUS_IDS)[number];

export const QUICK_FOCUS_LABELS: Record<QuickFocus, string> = {
  "1x2": "Výsledek 1X2",
  goals: "Góly Over/Under 2,5",
  btts: "Oba týmy skórují",
  team_goals: "Týmové góly",
  corners: "Rohy",
  cards: "Karty a rozhodčí",
};

/**
 * Vybere pro každou veřejnou kategorii nejnovější uloženou politiku. Staré v1
 * snapshoty ještě neměly `leagueId`, proto se jejich příslušnost ověřuje přes
 * navázanou predikci a předává jako množina podporovaných fixture ID.
 */
export function newestFrozenQuickRows<T extends { category: string; policyVersion: number; fixtureId: number }>(
  rows: T[],
  supportedFixtureIds: ReadonlySet<number>
): T[] {
  const eligible = rows.filter((row) =>
    supportedFixtureIds.has(row.fixtureId) && QUICK_FOCUS_IDS.includes(row.category as QuickFocus)
  );
  const newestPolicy = new Map(QUICK_FOCUS_IDS.map((category) => [
    category,
    Math.max(0, ...eligible.filter((row) => row.category === category).map((row) => row.policyVersion)),
  ]));
  return eligible.filter((row) => row.policyVersion === newestPolicy.get(row.category as QuickFocus));
}

export interface QuickMarketSignal {
  market: "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS" | "TEAM_HOME_05" | "TEAM_HOME_15" | "TEAM_AWAY_05" | "TEAM_AWAY_15";
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
const reliability = (row: PredictionRow) => Math.min(1, Math.max(0, row.readinessSample / 10));
const penalty = (row: PredictionRow) => row.lowConfidence ? 0.82 : 1;

function signal(candidate: QuickCandidate, market: QuickMarketSignal["market"]) {
  return candidate.signals.find((item) => item.market === market) ?? null;
}

export interface QuickFocusSelection {
  market: QuickMarketSignal["market"];
  side: QuickMarketSignal["side"];
  line: number | null;
  signal: QuickMarketSignal | null;
}

/**
 * Zobrazený důvod zmrazeného count výběru se odvozuje z auditních polí, ne ze
 * starého volného textu. Tím zůstávají správně čitelné i snapshoty vytvořené před
 * opravou záměny Over/Under.
 */
export function frozenQuickSelectionReason(
  snapshot: { category: string; reason: string; side: string | null; line: number | null; modelProbability: number | null },
  candidate: QuickCandidate
): string {
  if ((snapshot.category !== "corners" && snapshot.category !== "cards") || snapshot.line == null || (snapshot.side !== "OVER" && snapshot.side !== "UNDER")) return snapshot.reason;
  const probability = snapshot.modelProbability == null ? "—" : pct(snapshot.modelProbability);
  const referee = snapshot.category === "cards" && candidate.row.refereeSample && candidate.row.refereeSample >= 10
    ? ` · rozhodčí ${candidate.row.refereeFactor && candidate.row.refereeFactor > 1.03 ? "zvyšuje" : candidate.row.refereeFactor && candidate.row.refereeFactor < 0.97 ? "snižuje" : "neutrální"}`
    : "";
  return `${snapshot.side === "OVER" ? "Over" : "Under"} ${snapshot.line.toFixed(1)} · ${probability}${referee}`;
}

/** Jediná definice konkrétního scénáře, který karta rychlého přehledu sleduje. */
export function quickFocusSelection(candidate: QuickCandidate, focus: QuickFocus): QuickFocusSelection | null {
  if (focus === "1x2") {
    const ordered = [
      { side: "HOME" as const, value: candidate.row.homeWin },
      { side: "DRAW" as const, value: candidate.row.draw },
      { side: "AWAY" as const, value: candidate.row.awayWin },
    ].sort((a, b) => b.value - a.value);
    const picked = ordered[0];
    if (picked.side === "DRAW") return null;
    return { market: "1X2", side: picked.side, line: null, signal: signal(candidate, "1X2") };
  }
  if (focus === "goals") return { market: "OVER_25", side: candidate.row.over25 >= .5 ? "OVER" : "UNDER", line: 2.5, signal: signal(candidate, "OVER_25") };
  if (focus === "btts") return { market: "BTTS", side: candidate.row.bttsYes >= .5 ? "OVER" : "UNDER", line: null, signal: signal(candidate, "BTTS") };
  if (focus === "team_goals") {
    const picked = bestTeamGoalScenario(candidate);
    return picked ? { market: picked.market, side: "OVER", line: picked.line, signal: signal(candidate, picked.market) } : null;
  }
  if (focus === "corners" || focus === "cards") {
    const picked = signal(candidate, focus === "corners" ? "CORNERS" : "CARDS");
    return picked ? { market: picked.market, side: picked.side, line: picked.line, signal: picked } : null;
  }
  return null;
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
    if (best.value + 1e-9 < 0.58 || gap + 1e-9 < 0.1 || row.readinessSample < 6 || row.lowConfidence) return null;
    const marketSignal = signal(candidate, "1X2");
    return make(best.value * 0.65 + gap * 0.25 + ready * 0.1, `${best.side} ${pct(best.value)} · náskok ${Math.round(gap * 100)} p. b.`, best.value, marketSignal?.openMarketProbability ?? null, marketSignal ? marketSignal.currentMarketProbability - marketSignal.openMarketProbability : null, marketSignal?.samples ?? 0);
  }

  if (focus === "goals") {
    const over = row.over25;
    const model = Math.max(over, 1 - over);
    const side = over >= 0.5 ? "Over 2,5" : "Under 2,5";
    if (model < 0.6 || row.readinessSample < 6 || row.lowConfidence) return null;
    const marketSignal = signal(candidate, "OVER_25");
    return make(model * 0.85 + ready * 0.15, `${side} · ${pct(model)}`, model, marketSignal?.openMarketProbability ?? null, marketSignal ? marketSignal.currentMarketProbability - marketSignal.openMarketProbability : null, marketSignal?.samples ?? 0);
  }

  if (focus === "btts") {
    const yes = row.bttsYes;
    const model = Math.max(yes, 1 - yes);
    const side = yes >= 0.5 ? "Oba skórují – Ano" : "Oba skórují – Ne";
    if (model < 0.6 || row.readinessSample < 6 || row.lowConfidence) return null;
    const marketSignal = signal(candidate, "BTTS");
    return make(model * 0.85 + ready * 0.15, `${side} · ${pct(model)}`, model, marketSignal?.openMarketProbability ?? null, marketSignal ? marketSignal.currentMarketProbability - marketSignal.openMarketProbability : null, marketSignal?.samples ?? 0);
  }

  if (focus === "team_goals") {
    const picked = bestTeamGoalScenario(candidate);
    if (!picked || row.readinessSample < 6 || row.lowConfidence) return null;
    const marketSignal = signal(candidate, picked.market);
    return make(picked.probability * .85 + ready * .15, `${picked.teamName} Over ${picked.line.toFixed(1)} · ${pct(picked.probability)}`, picked.probability, marketSignal?.openMarketProbability ?? null, marketSignal ? marketSignal.currentMarketProbability - marketSignal.openMarketProbability : null, marketSignal?.samples ?? 0);
  }

  if (focus === "corners" || focus === "cards") {
    const marketSignal = signal(candidate, focus === "corners" ? "CORNERS" : "CARDS");
    if (!marketSignal || marketSignal.line == null) return null;
    // MarketSignal ukládá pravděpodobnost už pro zvolenou stranu (`side`), nikoli
    // vždy pravděpodobnost Overu. Opětovné odvození strany z hodnoty >= 50 % proto
    // historicky zobrazovalo silný Under jako Over, přestože settlement četl správné
    // uložené `side`.
    const model = marketSignal.modelProbability;
    if (Math.abs(marketSignal.line % 1) !== 0.5 || model < 0.6 || row.readinessSample < 6 || row.lowConfidence) return null;
    const side = marketSignal.side === "OVER" ? "Over" : "Under";
    const referee = focus === "cards" && row.refereeSample && row.refereeSample >= 10
      ? ` · rozhodčí ${row.refereeFactor && row.refereeFactor > 1.03 ? "zvyšuje" : row.refereeFactor && row.refereeFactor < 0.97 ? "snižuje" : "neutrální"}`
      : "";
    return make(model * 0.7 + Math.min(marketSignal.samples, 5) / 5 * 0.15 + ready * 0.15, `${side} ${marketSignal.line.toFixed(1)} · ${pct(model)}${referee}`, model, marketSignal.openMarketProbability, marketSignal.currentMarketProbability - marketSignal.openMarketProbability, marketSignal.samples);
  }

  return null;
}

function bestTeamGoalScenario(candidate: QuickCandidate) {
  const { row } = candidate;
  const scenarios = ([
    { market: "TEAM_HOME_15", side: "home", line: 1.5, teamName: row.homeName, threshold: .6 },
    { market: "TEAM_AWAY_15", side: "away", line: 1.5, teamName: row.awayName, threshold: .6 },
    { market: "TEAM_HOME_05", side: "home", line: .5, teamName: row.homeName, threshold: .78 },
    { market: "TEAM_AWAY_05", side: "away", line: .5, teamName: row.awayName, threshold: .78 },
  ] as const).map((item) => ({ ...item, probability: teamTotalProb(row, item.side, item.line) }))
    .filter((item) => item.probability + 1e-9 >= item.threshold)
    .sort((a, b) => b.line - a.line || (b.probability - b.threshold) - (a.probability - a.threshold));
  return scenarios[0] ?? null;
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
