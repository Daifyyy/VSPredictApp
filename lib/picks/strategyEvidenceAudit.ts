import { binaryOutcome } from "./evaluation";

export interface EvidenceRow {
  id: string; fixtureId: number; leagueId: number; homeTeamId: number; awayTeamId: number;
  strategy: string; policyVersion: number; modelVersion: number; contextVersion: number;
  countModelVersion: number | null; modelContext: string; market: string; side: string; line: number | null;
  kickoff: string; qualifiedAt: string | null; settledAt: string | null;
  decimalOdds: number | null; bookmaker: string | null; stake: number;
  modelProbability: number; marketProbability: number;
  settlementStatus: string; hit: boolean | null; profit: number | null; actualCount: number | null;
  clvMethodVersion: number | null; closedAt: string | null; closingBenchmarkProbability: number | null;
  closingBenchmarkQuality: string | null; sameBookClv: boolean | null;
  openingBookmaker: string | null;
}
export interface EvidenceFixture {
  fixtureId: number; homeTeamId: number; awayTeamId: number; status: string;
  homeGoals: number | null; awayGoals: number | null;
}
const timestamp = (s: string | null) => s == null ? NaN : Date.parse(s);
const probability = (p: number | null) => p != null && Number.isFinite(p) && p > 0 && p < 1;
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const profit = (r: EvidenceRow) => r.hit ? r.decimalOdds! - 1 : -1;
const day = (r: EvidenceRow) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date(r.kickoff));
export const evidenceCohortKey = (r: EvidenceRow) => [r.strategy, r.policyVersion, r.modelVersion, r.contextVersion, r.countModelVersion ?? "-", r.modelContext, r.market].join("/");

/** Whole Prague days (including all correlated fixtures), deterministic descriptive CI. */
export function dayBlockInterval(rows: EvidenceRow[], value: (row: EvidenceRow) => number) {
  const groups = new Map<string, number[]>();
  for (const r of rows) groups.set(day(r), [...(groups.get(day(r)) ?? []), value(r)]);
  if (rows.length < 10 || groups.size < 5) return null;
  const blocks = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => values);
  let seed = 20261018;
  const draws: number[] = [];
  for (let i = 0; i < 2000; i++) {
    let sum = 0, n = 0;
    for (let j = 0; j < blocks.length; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const block = blocks[Math.floor(seed / 4294967296 * blocks.length)];
      for (const x of block) { sum += x; n++; }
    }
    draws.push(sum / n);
  }
  draws.sort((a, b) => a - b);
  return { low: draws[49], high: draws[1949] };
}

/** No DB, provider calls, backfilling, or activation. Input is one immutable export. */
export function auditStrategyEvidence(rows: EvidenceRow[], fixtures: EvidenceFixture[], asOf: string) {
  const cutoff = timestamp(asOf);
  if (!Number.isFinite(cutoff)) throw Error("INVALID_AUDIT_CUTOFF");
  const byFixture = new Map(fixtures.map(r => [r.fixtureId, r]));
  if (byFixture.size !== fixtures.length) throw Error("DUPLICATE_FIXTURE_JOIN");
  const ids = new Map<string, number>(), grains = new Map<string, number>();
  for (const r of rows) {
    ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
    const grain = `${r.fixtureId}/${r.strategy}/${r.policyVersion}`;
    grains.set(grain, (grains.get(grain) ?? 0) + 1);
  }
  const checked = rows.map(r => {
    const errors: string[] = [], warnings: string[] = [];
    const fixture = byFixture.get(r.fixtureId);
    if (ids.get(r.id)! > 1 || grains.get(`${r.fixtureId}/${r.strategy}/${r.policyVersion}`)! > 1) errors.push("DUPLICATE_GRAIN");
    if (!fixture) errors.push("MISSING_FIXTURE");
    else if (fixture.homeTeamId !== r.homeTeamId || fixture.awayTeamId !== r.awayTeamId) errors.push("FIXTURE_IDENTITY_MISMATCH");
    if (!(timestamp(r.qualifiedAt) < timestamp(r.kickoff)) || timestamp(r.qualifiedAt) > cutoff) errors.push("NOT_PREMATCH");
    if (!(r.decimalOdds != null && Number.isFinite(r.decimalOdds) && r.decimalOdds > 1) || !r.bookmaker?.trim()) errors.push("MISSING_EXECUTION_PRICE");
    if (!probability(r.modelProbability) || !probability(r.marketProbability)) warnings.push("INVALID_PROBABILITY_PAIR");
    if (r.settlementStatus === "SETTLED") {
      if (typeof r.hit !== "boolean" || !Number.isFinite(timestamp(r.settledAt)) || timestamp(r.settledAt) > cutoff || timestamp(r.settledAt) < timestamp(r.kickoff)) errors.push("INVALID_SETTLEMENT");
      if (fixture && !["FT", "AET", "PEN"].includes(fixture.status)) errors.push("NON_FINAL_FIXTURE");
      const resolved = fixture ? binaryOutcome(r.market, r.side, fixture.homeGoals, fixture.awayGoals, r.line, r.actualCount) : null;
      if (resolved == null) errors.push("OUTCOME_NOT_RECONSTRUCTABLE");
      else if (resolved !== r.hit) errors.push("OUTCOME_MISMATCH");
      if (r.profit == null || !Number.isFinite(r.profit) || !Number.isFinite(r.stake) || r.stake <= 0 || Math.abs(r.profit - profit(r) * r.stake) > 1e-6) errors.push("PROFIT_MISMATCH");
    } else if (r.hit != null) errors.push("HIT_WITHOUT_SETTLEMENT");
    // Identity of the price/period and input-time provenance are not proven by scalar ledgers.
    warnings.push("SOURCE_PRICE_PERIOD_NOT_INDEPENDENTLY_VERIFIED");
    return { row: r, errors, warnings };
  });
  const keys = [...new Set(rows.map(evidenceCohortKey))].sort();
  const cohorts = keys.map(key => {
    const group = checked.filter(r => evidenceCohortKey(r.row) === key);
    // Published accounting remains visible even when a row is unsuitable as model evidence.
    const ledger = group.map(r => r.row).filter(r => r.settlementStatus === "SETTLED" && typeof r.hit === "boolean"
      && timestamp(r.settledAt) <= cutoff && r.decimalOdds != null && Number.isFinite(r.decimalOdds) && r.decimalOdds > 1);
    const clean = group.filter(r => !r.errors.length).map(r => r.row);
    const settled = clean.filter(r => r.settlementStatus === "SETTLED").sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
    const paired = settled.filter(r => probability(r.modelProbability) && probability(r.marketProbability));
    const loss = (p: number, hit: boolean | null) => -Math.log(Math.max(1e-9, hit ? p : 1 - p));
    const matureV2 = clean.filter(r => r.clvMethodVersion === 2 && timestamp(r.kickoff) <= cutoff);
    const closing = matureV2.filter(r => probability(r.closingBenchmarkProbability) && timestamp(r.closedAt) <= cutoff && timestamp(r.closedAt) <= timestamp(r.kickoff) && timestamp(r.kickoff) - timestamp(r.closedAt) <= 75 * 60_000);
    const primary = closing.filter(r => timestamp(r.kickoff) - timestamp(r.closedAt) <= 30 * 60_000);
    const strict = primary.filter(r => r.closingBenchmarkQuality === "PANEL" && r.sameBookClv === true && r.bookmaker === r.openingBookmaker);
    const priceClv = (r: EvidenceRow) => r.decimalOdds! * r.closingBenchmarkProbability! - 1;
    const days = [...new Set(settled.map(day))];
    const daily = days.map(d => ({ day: d, n: settled.filter(r => day(r) === d).length, profit: settled.filter(r => day(r) === d).reduce((sum, r) => sum + profit(r), 0) }));
    const bestDay = daily.length ? Math.max(...daily.map(r => r.profit)) : null;
    let balance = 0, peak = 0, drawdown = 0;
    for (const r of settled) { balance += profit(r); peak = Math.max(peak, balance); drawdown = Math.max(drawdown, peak - balance); }
    return { key, total: group.length, excluded: group.filter(r => r.errors.length).length,
      ledger: { settled: ledger.length, wins: ledger.filter(r => r.hit).length, profit: ledger.reduce((sum, r) => sum + profit(r), 0), roi: mean(ledger.map(profit)) },
      settled: settled.length,
      pending: clean.filter(r => r.settlementStatus === "PENDING").length, void: clean.filter(r => r.settlementStatus === "VOID").length,
      unavailable: clean.filter(r => r.settlementStatus === "UNAVAILABLE").length,
      wins: settled.filter(r => r.hit).length, hitRate: mean(settled.map(r => Number(r.hit))), profit: balance,
      roi: mean(settled.map(profit)), roiCI95: dayBlockInterval(settled, profit), days: days.length, drawdown,
      profitWithoutBestDay: bestDay == null ? null : balance - bestDay, daily,
      paired: { n: paired.length, modelLogLoss: mean(paired.map(r => loss(r.modelProbability, r.hit))), marketLogLoss: mean(paired.map(r => loss(r.marketProbability, r.hit))),
        deltaCI95: dayBlockInterval(paired, r => loss(r.modelProbability, r.hit) - loss(r.marketProbability, r.hit)) },
      clv: { denominator: matureV2.length, primary: primary.length, fallbackIncluded: closing.length, primaryPanelSameBook: strict.length,
        coverage30: matureV2.length ? primary.length / matureV2.length : null, mean: mean(strict.map(priceClv)), ci95: dayBlockInterval(strict, priceClv) },
      evidence: "NOT_VALIDATED" as const,
    };
  });
  return { version: 1, asOf, rows: rows.length, cohorts, issues: checked.filter(r => r.errors.length).map(r => ({ id: r.row.id, cohort: evidenceCohortKey(r.row), reasons: r.errors })),
    limitations: ["Selected bets, not all model predictions; binary 1X2 selection loss is not multinomial model loss.", "Historical descriptive comparisons, not untouched holdout or activation evidence.", "Price period, opposite quote and historical feature availability require source-level verification.", "FixturePrediction scores use the application's regulation-time normalization; no independent provider verification.", "Flat stake 1; pending, void and unavailable excluded from ROI, not silently counted as losses."] };
}
