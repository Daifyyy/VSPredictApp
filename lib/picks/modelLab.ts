import { freshClosing } from "./evaluation";
import { AUTONOMOUS_POLICY_VERSION } from "./autonomousPortfolio";
import { summarizePortfolio, type PortfolioSummary } from "./portfolioStats";
import { resolvedStrategyOutcome } from "./strategyOutcome";

export const MODEL_LAB_STATUSES = ["RESEARCH", "LIVE_TEST", "CANDIDATE", "VALIDATED", "REJECTED", "RETIRED"] as const;
export type ModelLabStatus = typeof MODEL_LAB_STATUSES[number];
export type ModelLabContext = "LEAGUE" | "EURO_CUP" | "NATIONAL";

export interface StrategyCatalogItem {
  strategy: string;
  policyVersion: number;
  market: string;
  title: string;
  status: ModelLabStatus;
  minimumSample: number;
  rules: string;
  decision: string;
}

export const STRATEGY_CATALOG: StrategyCatalogItem[] = [
  { strategy: "PRESSURE_FLOW_V5", policyVersion: 501, market: "GOAL_FLOW", title: "Průběh v5", status: "RESEARCH", minimumSample: 200, rules: "Přímý kurz 1,50–3,50 · coverage 75 % · pravděpodobnost 55 % · edge 4 p. b. · EV 3 %", decision: "Oddělená kalibrace Over 2,5, BTTS a týmových gólů na prospektivní kohortě" },
  { strategy: "ONE_X_TWO", policyVersion: 2, market: "1X2", title: "1X2 v2", status: "LIVE_TEST", minimumSample: 200, rules: "58 % · náskok 10 p. b. · edge 4 p. b. · EV 2 %", decision: "ROI, closing benchmark a kalibrace na stejné kohortě" },
  { strategy: "OVER_25", policyVersion: 1, market: "OVER_25", title: "Over 2,5 v1", status: "LIVE_TEST", minimumSample: 200, rules: "60 % · edge 4 p. b. · EV 2 %", decision: "Časový holdout, kladné CLV a stabilní kalibrace" },
  { strategy: "BTTS_YES", policyVersion: 1, market: "BTTS", title: "BTTS Ano v1", status: "LIVE_TEST", minimumSample: 200, rules: "60 % · edge 2 p. b. · EV 2 %", decision: "Časový holdout, kladné CLV a stabilita napříč ligami" },
  { strategy: "CORNERS", policyVersion: 1, market: "CORNERS", title: "Rohy Over/Under v1", status: "RESEARCH", minimumSample: 200, rules: "60 % · edge 5 p. b. · EV 3 % · skutečná půlková linie", decision: "Po pre-launch auditu prospektivní ROI, čerstvé CLV a kalibrace proti stejnému trhu" },
  { strategy: "CARDS_REF", policyVersion: 1, market: "CARDS", title: "Karty · s rozhodčím", status: "RESEARCH", minimumSample: 200, rules: "Oddělená verze s auditním faktorem rozhodčího", decision: "Kalibrace a benchmark pouze v rámci stejné verze" },
  { strategy: "FOULS", policyVersion: 1, market: "FOULS", title: "Fauly", status: "RESEARCH", minimumSample: 200, rules: "Přímý match-total Over/Under s neměnnou cenou", decision: "Kalibrace, CLV a ROI až nad prospektivně zachycenými výběry" },
  { strategy: "TEAM_GOALS", policyVersion: 3, market: "TEAM_TOTAL", title: "Týmové góly 0,5 / 1,5 v3", status: "RESEARCH", minimumSample: 200, rules: "Hratelná přímá cena, konzervativní EV a nejvýše jeden výběr na zápas", decision: "Vyhodnotit až na nové prospektivní kohortě" },
  { strategy: "TEAM_GOALS", policyVersion: 2, market: "TEAM_TOTAL", title: "Týmové góly 0,5 / 1,5 v2", status: "RETIRED", minimumSample: 0, rules: "Všechny dostupné týmové trhy se zmrazenou cenou", decision: "Historie zůstává oddělená; neprezentovat jako doporučení" },
  { strategy: "TEAM_GOALS", policyVersion: 1, market: "TEAM_TOTAL", title: "Týmové góly v1", status: "RETIRED", minimumSample: 0, rules: "Historická sportovní diagnostika bez zmrazené ceny", decision: "Kalibrace ano, ROI se zpětně nepočítá" },
  { strategy: "CHECKLIST", policyVersion: 1, market: "MIXED", title: "Checklist v1", status: "RETIRED", minimumSample: 0, rules: "Historická ukončená politika", decision: "Pouze neměnný archiv" },
  { strategy: "PUBLISHED_1X2", policyVersion: 1, market: "1X2", title: "Publikované 1X2 v1", status: "RETIRED", minimumSample: 0, rules: "55 % · náskok 10 p. b.", decision: "Pouze neměnný archiv" },
];

// Uživatel smí v aktivním přehledu vidět pouze novou bezpečnější gólovou kohortu.
for (const definition of STRATEGY_CATALOG) {
  if ((definition.strategy === "OVER_25" || definition.strategy === "BTTS_YES") && definition.status !== "RETIRED") {
    STRATEGY_CATALOG.push({ ...definition, status: "RETIRED", decision: "Historická policy v1; výsledky se nepřepočítávají novými pravidly." });
    definition.policyVersion = AUTONOMOUS_POLICY_VERSION[definition.strategy];
    definition.title = definition.strategy === "OVER_25" ? "Over 2,5 v2" : "BTTS Ano v2";
    definition.rules = definition.strategy === "OVER_25"
      ? "60 % · vzorek 8 · edge 4–12 p. b. · EV 2 %"
      : "60 % · vzorek 8 · edge 2–12 p. b. · EV 2 %";
  }
}

export interface ModelLabLedgerRow {
  id: string;
  fixtureId: number;
  leagueId: number;
  kickoff: Date;
  strategy: string;
  policyVersion: number;
  market: string;
  side: string;
  line: number | null;
  modelProbability: number;
  marketProbability: number;
  decimalOdds: number | null;
  stake: number;
  modelContext: string;
  modelVersion: number;
  qualifiedAt: Date | null;
  closingMarketProbability: number | null;
  closedAt: Date | null;
  priceClv?: number | null;
  probabilityClv?: number | null;
  closingFreshness?: string | null;
  closingBenchmarkQuality?: string | null;
  sameBookClv?: boolean | null;
  clvMethodVersion?: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  actualCount?: number | null;
}

const outcomeOf = (row: ModelLabLedgerRow) => resolvedStrategyOutcome({
  market: row.market, side: row.side, line: row.line,
  homeGoals: row.homeGoals, awayGoals: row.awayGoals, actualCount: row.actualCount ?? null,
});

export interface ProbabilityMetrics { n: number; brier: number | null; logLoss: number | null; ece: number | null }

export function probabilityMetrics(rows: Array<{ probability: number; outcome: boolean }>): ProbabilityMetrics {
  if (!rows.length) return { n: 0, brier: null, logLoss: null, ece: null };
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  let brier = 0, logLoss = 0;
  for (const row of rows) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, row.probability));
    const y = Number(row.outcome);
    brier += (p - y) ** 2;
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.n++; bin.p += p; bin.y += y;
  }
  return {
    n: rows.length,
    brier: brier / rows.length,
    logLoss: logLoss / rows.length,
    ece: bins.reduce((sum, bin) => sum + (bin.n ? bin.n / rows.length * Math.abs(bin.p / bin.n - bin.y / bin.n) : 0), 0),
  };
}

function holdoutRows(rows: ModelLabLedgerRow[]) {
  const ordered = [...rows].filter((row) => outcomeOf(row) != null).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  return ordered.slice(Math.floor(ordered.length * .7));
}

export function bankrollSimulation(rows: ModelLabLedgerRow[], mode: "FLAT" | "PERCENT" | "KELLY", initial = 100) {
  let bankroll = initial, peak = initial, maxDrawdown = 0, longestLosingStreak = 0, losingStreak = 0;
  const returns: number[] = [];
  for (const row of [...rows].sort((a, b) => (a.qualifiedAt ?? a.kickoff).getTime() - (b.qualifiedAt ?? b.kickoff).getTime())) {
    const hit = outcomeOf(row);
    if (hit == null || row.decimalOdds == null || row.decimalOdds <= 1) continue;
    const fraction = mode === "FLAT" ? 1 / Math.max(bankroll, 1) : mode === "PERCENT" ? .01 : Math.min(.01, Math.max(0, ((row.modelProbability * row.decimalOdds - 1) / (row.decimalOdds - 1)) * .25));
    const stake = mode === "FLAT" ? 1 : bankroll * fraction;
    const profit = hit ? stake * (row.decimalOdds - 1) : -stake;
    bankroll += profit; returns.push(profit);
    losingStreak = hit ? 0 : losingStreak + 1;
    longestLosingStreak = Math.max(longestLosingStreak, losingStreak);
    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.max(maxDrawdown, peak - bankroll);
  }
  const average = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const volatility = returns.length ? Math.sqrt(returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length) : 0;
  return { mode, initial, final: bankroll, profit: bankroll - initial, maxDrawdown, volatility, longestLosingStreak, below75: bankroll < initial * .75 };
}

function segmentLabel(row: ModelLabLedgerRow, kind: string) {
  if (kind === "league") return String(row.leagueId);
  if (kind === "side") return row.side;
  if (kind === "model") return `${Math.floor(row.modelProbability * 10) * 10}–${Math.floor(row.modelProbability * 10) * 10 + 10} %`;
  if (kind === "odds") return row.decimalOdds == null ? "bez kurzu" : row.decimalOdds < 1.7 ? "< 1,70" : row.decimalOdds < 2.2 ? "1,70–2,19" : "≥ 2,20";
  const edge = row.modelProbability - row.marketProbability;
  return edge < .04 ? "< 4 p. b." : edge < .08 ? "4–7,9 p. b." : "≥ 8 p. b.";
}

export function modelLabSummary(rows: ModelLabLedgerRow[]) {
  const settled = rows.flatMap((row) => {
    const hit = outcomeOf(row);
    return hit == null ? [] : [{ row, hit }];
  });
  const closes = rows.flatMap((row) => {
    const close = freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close;
    return close == null ? [] : [{ row, close }];
  });
  const model = probabilityMetrics(settled.map(({ row, hit }) => ({ probability: row.modelProbability, outcome: hit })));
  const opening = probabilityMetrics(settled.map(({ row, hit }) => ({ probability: row.marketProbability, outcome: hit })));
  const closing = probabilityMetrics(settled.flatMap(({ row, hit }) => {
    const close = freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close;
    return close == null ? [] : [{ probability: close, outcome: hit }];
  }));
  const portfolioInput = rows.map((row) => ({ strategy: row.strategy, stake: row.stake, odds: row.decimalOdds, hit: outcomeOf(row), marketProbability: row.marketProbability, closingMarketProbability: row.closingMarketProbability, qualifiedAt: row.qualifiedAt, fixtureId: row.fixtureId, kickoff: row.kickoff, closedAt: row.closedAt, priceClv: row.priceClv, probabilityClv: row.probabilityClv, closingFreshness: row.closingFreshness, benchmarkQuality: row.closingBenchmarkQuality, sameBookClv: row.sameBookClv, clvMethodVersion: row.clvMethodVersion }));
  const portfolio = summarizePortfolio(portfolioInput);
  const positiveClvRate = closes.length ? closes.filter(({ row, close }) => close > row.marketProbability).length / closes.length : null;
  const chronologicalHoldout = holdoutRows(rows);
  const holdout = summarizePortfolio(chronologicalHoldout.map((row) => ({ strategy: row.strategy, stake: row.stake, odds: row.decimalOdds, hit: outcomeOf(row), marketProbability: row.marketProbability, closingMarketProbability: row.closingMarketProbability, qualifiedAt: row.qualifiedAt, fixtureId: row.fixtureId, kickoff: row.kickoff, closedAt: row.closedAt, priceClv: row.priceClv, probabilityClv: row.probabilityClv, closingFreshness: row.closingFreshness, benchmarkQuality: row.closingBenchmarkQuality, sameBookClv: row.sameBookClv, clvMethodVersion: row.clvMethodVersion })));
  const holdoutSettled = chronologicalHoldout.flatMap((row) => { const hit = outcomeOf(row); return hit == null ? [] : [{ row, hit }]; });
  const holdoutModel = probabilityMetrics(holdoutSettled.map(({ row, hit }) => ({ probability: row.modelProbability, outcome: hit })));
  const holdoutOpening = probabilityMetrics(holdoutSettled.map(({ row, hit }) => ({ probability: row.marketProbability, outcome: hit })));
  const v2Primary = rows.filter((row) => row.clvMethodVersion === 2 && row.closingFreshness === "PRIMARY_30" && row.closingBenchmarkQuality === "PANEL" && row.sameBookClv && row.priceClv != null);
  const segmentGroups = new Map<string, number[]>();
  const dayGroups = new Map<string, number[]>();
  for (const row of v2Primary) {
    const oddsBucket = row.decimalOdds == null ? "none" : row.decimalOdds < 1.7 ? "short" : row.decimalOdds < 2.2 ? "mid" : "long";
    for (const key of [`league:${row.leagueId}`, `odds:${oddsBucket}`]) segmentGroups.set(key, [...(segmentGroups.get(key) ?? []), row.priceClv!]);
    const day = row.kickoff.toISOString().slice(0, 10);
    dayGroups.set(day, [...(dayGroups.get(day) ?? []), row.priceClv!]);
  }
  const meaningfulSegments = [...segmentGroups.values()].filter((values) => values.length >= 20);
  const segmentStable = meaningfulSegments.every((values) => values.reduce((sum, value) => sum + value, 0) / values.length >= 0);
  const dayMeans = [...dayGroups.values()].map((values) => values.reduce((sum, value) => sum + value, 0) / values.length);
  const dayStable = dayMeans.length >= 20 && dayMeans.filter((value) => value > 0).length / dayMeans.length > .5;
  const gates = {
    frozenPolicy: rows.length > 0,
    sampleAndCoverage: portfolio.gateReason === "REQUIRES_HOLDOUT_AND_SEGMENT_VALIDATION",
    clv: portfolio.gateReason === "REQUIRES_HOLDOUT_AND_SEGMENT_VALIDATION" && (portfolio.averagePriceClv ?? -Infinity) > 0,
    calibration: model.ece != null && model.ece <= .05,
    chronologicalHoldout: holdoutModel.logLoss != null && holdoutOpening.logLoss != null && holdoutModel.logLoss < holdoutOpening.logLoss,
    segmentStable,
    dayStable,
  };
  const recommendedStatus: ModelLabStatus = Object.values(gates).every(Boolean) ? "CANDIDATE" : rows.length ? "LIVE_TEST" : "RESEARCH";
  const verdict = !rows.length ? "Zatím bez živých výběrů." : model.logLoss != null && closing.logLoss != null && model.logLoss > closing.logLoss ? "Model zatím nepřekonává closingový trh." : portfolio.roiConfidence95 && portfolio.roiConfidence95.low <= 0 ? "ROI je neprůkazné; interval stále zahrnuje ztrátu." : gates.clv ? "Trh se pohybuje směrem modelu, čekáme na dostatečný holdout." : "Vzorek nebo CLV zatím nestačí k rozhodnutí.";
  return { portfolio, holdout, probability: { model, opening, closing }, positiveClvRate, closingCompleteness: rows.length ? closes.length / rows.length : 0, gates, recommendedStatus, verdict, bankroll: [bankrollSimulation(rows, "FLAT"), bankrollSimulation(rows, "PERCENT"), bankrollSimulation(rows, "KELLY")] };
}

export function modelLabSegments(rows: ModelLabLedgerRow[]) {
  return ["league", "model", "odds", "edge", "side"].map((kind) => {
    const groups = new Map<string, ModelLabLedgerRow[]>();
    for (const row of rows) { const key = segmentLabel(row, kind); groups.set(key, [...(groups.get(key) ?? []), row]); }
    return { kind, groups: [...groups].map(([label, values]) => ({ label, descriptiveOnly: values.filter((row) => row.market === "CORNERS" || row.market === "CARDS" ? row.actualCount != null : row.homeGoals != null && row.awayGoals != null).length < 20, ...modelLabSummary(values) })) };
  });
}

export type ModelLabPortfolioSummary = PortfolioSummary;
