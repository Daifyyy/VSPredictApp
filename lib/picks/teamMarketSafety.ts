/** Audit 2026-10-13: legacy quotes did not preserve full-time market identity.
 * Keep the quarantine explicit until provider identity and a NEW cohort are verified.
 * This does not mutate stored predictions, prices or settlement history.
 */
export const TEAM_GOALS_QUARANTINE_REASON = "TEAM_MARKET_DATA_QUARANTINE";
export const TEAM_GOALS_QUARANTINE_MESSAGE = "Týmové góly jsou dočasně datově blokované: ověřujeme identitu kurzů pro celý zápas. Historická bilance není důkazem tržní výhody.";
export function isQuarantinedTeamMarket(market: string): boolean {
  return market.startsWith("TEAM_") || market === "totalHome" || market === "totalAway";
}

/** Reject an entire team ladder if nested events have contradictory prices. */
export function coherentTeamLines<T extends { line: number; over: number | null; under: number | null }>(lines: T[]): T[] {
  const sorted = [...lines].sort((a, b) => a.line - b.line);
  if (sorted.some(r => !Number.isFinite(r.line) || r.line < 0 || [r.over, r.under].some(p => p != null && (!Number.isFinite(p) || p <= 1)))) return [];
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j];
    if (a.line === b.line || (a.over != null && b.over != null && a.over > b.over + 1e-9) || (a.under != null && b.under != null && a.under + 1e-9 < b.under)) return [];
  }
  return sorted;
}
