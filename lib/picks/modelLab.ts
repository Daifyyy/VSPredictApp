import { binaryOutcome, freshClosing } from "./evaluation";
import { summarizePortfolio, type PortfolioSummary } from "./portfolioStats";

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
  { strategy: "ONE_X_TWO", policyVersion: 2, market: "1X2", title: "1X2 v2", status: "LIVE_TEST", minimumSample: 200, rules: "58 % · náskok 10 p. b. · edge 4 p. b. · EV 2 %", decision: "ROI, closing benchmark a kalibrace na stejné kohortě" },
  { strategy: "OVER_25", policyVersion: 1, market: "OVER_25", title: "Over 2,5 v1", status: "LIVE_TEST", minimumSample: 200, rules: "60 % · edge 4 p. b. · EV 2 %", decision: "Časový holdout, kladné CLV a stabilní kalibrace" },
  { strategy: "BTTS_YES", policyVersion: 1, market: "BTTS", title: "BTTS Ano v1", status: "LIVE_TEST", minimumSample: 200, rules: "60 % · edge 2 p. b. · EV 2 %", decision: "Časový holdout, kladné CLV a stabilita napříč ligami" },
  { strategy: "CORNERS", policyVersion: 1, market: "CORNERS", title: "Rohy Over/Under v1", status: "RESEARCH", minimumSample: 200, rules: "60 % · edge 5 p. b. · EV 3 % · skutečná půlková linie", decision: "Po pre-launch auditu prospektivní ROI, čerstvé CLV a kalibrace proti stejnému trhu" },
  { strategy: "CARDS_REF", policyVersion: 1, market: "CARDS", title: "Karty · s rozhodčím", status: "RESEARCH", minimumSample: 200, rules: "Oddělená verze s auditním faktorem rozhodčího", decision: "Kalibrace a benchmark pouze v rámci stejné verze" },
  { strategy: "FOULS", policyVersion: 1, market: "FOULS", title: "Fauly", status: "RESEARCH", minimumSample: 150, rules: "Početní prognóza bez sázkového trhu", decision: "MAE a bias podle lig; bez ROI do dostupnosti trhu" },
  { strategy: "TEAM_GOALS", policyVersion: 2, market: "TEAM_TOTAL", title: "Týmové góly 0,5 / 1,5 v2", status: "RESEARCH", minimumSample: 200, rules: "Prospektivní kalibrace se zmrazenou cenou", decision: "ROI až z cen neměnně uložených při kvalifikaci" },
  { strategy: "TEAM_GOALS", policyVersion: 1, market: "TEAM_TOTAL", title: "Týmové góly v1", status: "RETIRED", minimumSample: 0, rules: "Historická sportovní diagnostika bez zmrazené ceny", decision: "Kalibrace ano, ROI se zpětně nepočítá" },
  { strategy: "CHECKLIST", policyVersion: 1, market: "MIXED", title: "Checklist v1", status: "RETIRED", minimumSample: 0, rules: "Historická ukončená politika", decision: "Pouze neměnný archiv" },
  { strategy: "PUBLISHED_1X2", policyVersion: 1, market: "1X2", title: "Publikované 1X2 v1", status: "RETIRED", minimumSample: 0, rules: "55 % · náskok 10 p. b.", decision: "Pouze neměnný archiv" },
];

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
  homeGoals: number | null;
  awayGoals: number | null;
  actualCount?: number | null;
}

const outcomeOf = (row: ModelLabLedgerRow) =>
  binaryOutcome(row.market, row.side, row.homeGoals, row.awayGoals, row.line, row.actualCount ?? null);

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
  const portfolioInput = rows.map((row) => ({ strategy: row.strategy, stake: row.stake, odds: row.decimalOdds, hit: outcomeOf(row), marketProbability: row.marketProbability, closingMarketProbability: freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close, qualifiedAt: row.qualifiedAt }));
  const portfolio = summarizePortfolio(portfolioInput);
  const positiveClvRate = closes.length ? closes.filter(({ row, close }) => close > row.marketProbability).length / closes.length : null;
  const holdout = summarizePortfolio(holdoutRows(rows).map((row) => ({ strategy: row.strategy, stake: row.stake, odds: row.decimalOdds, hit: outcomeOf(row), marketProbability: row.marketProbability, closingMarketProbability: freshClosing(row.kickoff, row.closedAt, row.closingMarketProbability).close, qualifiedAt: row.qualifiedAt })));
  const gates = {
    frozenPolicy: rows.length > 0,
    sample: closes.length >= 200,
    holdoutRoi: (holdout.roi ?? -Infinity) > 0,
    clv: (portfolio.averageClv ?? -Infinity) >= .015 && (positiveClvRate ?? 0) > .52,
    calibration: model.ece != null && model.ece <= .05,
    vsClosing: model.logLoss != null && closing.logLoss != null && model.logLoss <= closing.logLoss,
  };
  const recommendedStatus: ModelLabStatus = Object.values(gates).every(Boolean) ? "CANDIDATE" : rows.length ? "LIVE_TEST" : "RESEARCH";
  const verdict = !rows.length ? "Zatím bez živých výběrů." : model.logLoss != null && closing.logLoss != null && model.logLoss > closing.logLoss ? "Model zatím nepřekonává closingový trh." : portfolio.roiConfidence95 && portfolio.roiConfidence95.low <= 0 ? "ROI je neprůkazné; interval stále zahrnuje ztrátu." : gates.clv ? "Trh se pohybuje směrem modelu, čekáme na dostatečný holdout." : "Vzorek nebo CLV zatím nestačí k rozhodnutí.";
  return { portfolio, holdout, probability: { model, opening, closing }, positiveClvRate, closingCompleteness: rows.length ? closes.length / rows.length : 0, gates, recommendedStatus, verdict, bankroll: [bankrollSimulation(rows, "FLAT"), bankrollSimulation(rows, "PERCENT"), bankrollSimulation(rows, "KELLY")] };
}

export function modelLabSegments(rows: ModelLabLedgerRow[]) {
  return ["league", "model", "odds", "edge", "side"].map((kind) => {
    const groups = new Map<string, ModelLabLedgerRow[]>();
    for (const row of rows) { const key = segmentLabel(row, kind); groups.set(key, [...(groups.get(key) ?? []), row]); }
    return { kind, groups: [...groups].map(([label, values]) => ({ label, descriptiveOnly: values.filter((row) => row.market === "CORNERS" ? row.actualCount != null : row.homeGoals != null && row.awayGoals != null).length < 20, ...modelLabSummary(values) })) };
  });
}

export type ModelLabPortfolioSummary = PortfolioSummary;
