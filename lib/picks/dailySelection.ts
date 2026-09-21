/** Policy v1. Pure selection: no inference, provider requests or historical fitting. */
export const DAILY_SELECTION_POLICY_VERSION = 1;
export type DailyEvidence = {
  cohortKey: string;
  cutoff: string;
  settledPriced: number;
  numericalGatesPassed: boolean;
  approvedAt: string | null;
  research: boolean;
  /** Descriptive source performance; never a claim of proven edge. */
  performance?: {
    days: number;
    pairedCount: number;
    modelLogLoss: number | null;
    marketLogLoss: number | null;
    modelBrier: number | null;
    marketBrier: number | null;
    roi: number | null;
    supportsSamplePriority: boolean;
  };
};
export type DailyCandidate = {
  id: string;
  sourceIds: string[];
  cohortKey: string;
  fixtureId: number;
  leagueId: number;
  kickoff: string;
  /** Canonical fixture + market + side + exact line/winner; never a display label. */
  marketKey: string;
  odds: number;
  bookmaker: string;
  oddsAt: string;
  priceKind: "DIRECT" | "SYNTHETIC" | "NONE";
  qualified: boolean;
  currentPriceQualified: boolean;
  identityValid: boolean;
  blocked: boolean;
  warnings: string[];
  marketProbability: number | null;
  benchmarkComparable: boolean;
  modelProbability: number | null;
  /** Models compared in one ranking must share probability semantics. */
  probabilityKind: string | null;
  evidence: DailyEvidence | null;
};
export type DailyTier = "DOCUMENTED_SOURCE" | "UNVERIFIED";
export type DailySelected = DailyCandidate & { tier: DailyTier; evidenceBand: number };
export type DailyExisting = { fixtureId: number; leagueId: number };
const validProbability = (p: number | null): p is number => p != null && Number.isFinite(p) && p > 0 && p < 1;
const band = (p: number | null) => validProbability(p) ? Math.floor((p + 1e-12) * 20) : -1;

export function dailyCandidateRejection(c: DailyCandidate, now: Date): string | null {
  if (!Number.isFinite(now.getTime())) return "INVALID_CLOCK";
  if (!c.qualified || !c.currentPriceQualified) return "SOURCE_NOT_QUALIFIED";
  if (!c.identityValid || !c.marketKey || !Number.isSafeInteger(c.fixtureId) || c.fixtureId <= 0 || !Number.isSafeInteger(c.leagueId) || c.leagueId <= 0) return "INVALID_IDENTITY";
  if (c.blocked) return "SOURCE_BLOCKED";
  if (c.priceKind !== "DIRECT") return "NOT_DIRECT_PRICE";
  if (!Number.isFinite(c.odds) || c.odds < 1.5 || c.odds > 3) return "ODDS_OUT_OF_RANGE";
  if (!c.bookmaker.trim()) return "MISSING_BOOKMAKER";
  const age = now.getTime() - Date.parse(c.oddsAt);
  if (!Number.isFinite(age) || age < 0 || age > 90 * 60_000) return "STALE_OR_INVALID_PRICE";
  const lead = Date.parse(c.kickoff) - now.getTime();
  if (!Number.isFinite(lead) || lead < 30 * 60_000) return "KICKOFF_TOO_CLOSE";
  if (!c.id || !c.cohortKey || !c.sourceIds.length) return "MISSING_SOURCE";
  return null;
}

function withEvidence(c: DailyCandidate, now: Date): DailySelected {
  const e = c.evidence;
  const usable = e && e.cohortKey === c.cohortKey && Number.isFinite(Date.parse(e.cutoff)) && Date.parse(e.cutoff) < now.getTime();
  const gates = !!usable && e.numericalGatesPassed && e.settledPriced >= 200;
  const approved = gates && !e.research && e.approvedAt != null && Number.isFinite(Date.parse(e.approvedAt)) && Date.parse(e.approvedAt) < now.getTime();
  // Volume alone is not positive evidence. A losing/worse-calibrated source must
  // not win solely because it accumulated more rows than a newly versioned source.
  const n = usable && e.performance?.supportsSamplePriority ? e.settledPriced : 0;
  const warnings = [...c.warnings];
  if (usable && e.performance && e.performance.pairedCount >= 10 &&
      e.performance.modelLogLoss != null && e.performance.marketLogLoss != null &&
      e.performance.modelLogLoss > e.performance.marketLogLoss &&
      e.performance.modelBrier != null && e.performance.marketBrier != null &&
      e.performance.modelBrier > e.performance.marketBrier) warnings.push("SOURCE_TRAILS_MARKET_SMALL_SAMPLE_NOT_PROOF");
  return { ...c, sourceIds: [...c.sourceIds], warnings, evidence: usable ? e : null,
    tier: approved ? "DOCUMENTED_SOURCE" : "UNVERIFIED",
    evidenceBand: gates ? 4 : n >= 200 ? 3 : n >= 100 ? 2 : n >= 50 ? 1 : 0 };
}

/** A total, transitive ordering. Do not use pair-dependent comparisons of model families. */
export function selectDailyCandidates(candidates: DailyCandidate[], existing: DailyExisting[], now: Date) {
  const rejected: Array<{ id: string; reason: string }> = [];
  const eligible = candidates.flatMap(c => {
    const reason = dailyCandidateRejection(c, now);
    if (reason) { rejected.push({ id: c.id, reason }); return []; }
    return [withEvidence(c, now)];
  });
  const primaryKey = (c: DailySelected) => [c.tier, c.evidenceBand, c.warnings.length ? 1 : 0,
    c.benchmarkComparable ? band(c.marketProbability) : -1].join(":");
  // If a tied group mixes model semantics or missing probabilities, skip the model
  // tie-break for the entire group. Comparing only some pairs is non-transitive.
  const families = new Map<string, Set<string>>();
  for (const c of eligible) {
    const key = primaryKey(c), set = families.get(key) ?? new Set<string>();
    set.add(validProbability(c.modelProbability) && c.probabilityKind ? c.probabilityKind : "MISSING");
    families.set(key, set);
  }
  eligible.sort((a,b) => {
    const tier = Number(b.tier === "DOCUMENTED_SOURCE") - Number(a.tier === "DOCUMENTED_SOURCE");
    const evidence = b.evidenceBand - a.evidenceBand;
    const warning = Number(a.warnings.length > 0) - Number(b.warnings.length > 0);
    const market = (b.benchmarkComparable ? band(b.marketProbability) : -1) - (a.benchmarkComparable ? band(a.marketProbability) : -1);
    if (tier || evidence || warning || market) return tier || evidence || warning || market;
    const set = families.get(primaryKey(a))!;
    const model = set.size === 1 && !set.has("MISSING") ? band(b.modelProbability) - band(a.modelProbability) : 0;
    return model || Date.parse(b.oddsAt) - Date.parse(a.oddsAt) || Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id);
  });
  const unique = new Map<string, DailySelected>();
  for (const c of eligible) {
    const key = `${c.fixtureId}:${c.marketKey}`, previous = unique.get(key);
    if (previous) {
      previous.sourceIds = [...new Set([...previous.sourceIds, ...c.sourceIds])].sort();
      rejected.push({id:c.id,reason:"DUPLICATE_MARKET"});
    } else unique.set(key,c);
  }
  const fixtures = new Set(existing.map(x => x.fixtureId));
  const leagues = new Map<number,number>();
  for (const x of existing) leagues.set(x.leagueId,(leagues.get(x.leagueId)??0)+1);
  const selected: DailySelected[] = [];
  for (const c of unique.values()) {
    const reason = existing.length + selected.length >= 5 ? "DAY_LIMIT" : fixtures.has(c.fixtureId) ? "FIXTURE_LIMIT" : (leagues.get(c.leagueId)??0) >= 2 ? "LEAGUE_LIMIT" : null;
    if (reason) { rejected.push({id:c.id,reason}); continue; }
    selected.push(c); fixtures.add(c.fixtureId); leagues.set(c.leagueId,(leagues.get(c.leagueId)??0)+1);
  }
  return {selected,rejected,emptyReason:selected.length ? null : existing.length >= 5 ? "DAY_FULL" : "NO_ELIGIBLE_ADDITIONS"};
}
