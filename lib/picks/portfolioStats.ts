export interface PortfolioEntryInput {
  strategy: string;
  stake: number;
  odds: number | null;
  hit: boolean | null;
  marketProbability: number;
  closingMarketProbability: number | null;
  qualifiedAt?: string | Date | null;
  closedAt?: string | Date | null;
  fixtureId?: number | null;
  kickoff?: string | Date | null;
  priceClv?: number | null;
  probabilityClv?: number | null;
  closingFreshness?: "PRIMARY_30" | "FALLBACK_75" | "STALE" | string | null;
  benchmarkQuality?: "PANEL" | "PINNACLE_SINGLE" | "CROSS_BOOK" | "UNAVAILABLE" | string | null;
  sameBookClv?: boolean | null;
  clvMethodVersion?: number | null;
}

export interface PortfolioSummary {
  total: number;
  pending: number;
  settled: number;
  hits: number;
  accuracy: number | null;
  staked: number;
  profit: number;
  roi: number | null;
  averageOdds: number | null;
  averageClv: number | null;
  clvComplete: number;
  maxDrawdown: number;
  roiConfidence95: { low: number; high: number } | null;
  averagePriceClv: number | null;
  priceClvPositiveRate: number | null;
  priceClvConfidence95: { low: number; high: number } | null;
  coverage30: number;
  coverage75: number;
  panelCoverage: number;
  clvMethodVersion: number;
  gateReason: string;
}

function blockBootstrapClv(entries: PortfolioEntryInput[]) {
  const eligible = entries.filter((entry) => entry.clvMethodVersion === 2 && entry.priceClv != null);
  if (eligible.length < 5) return null;
  const blocks = new Map<string, number[]>();
  for (const entry of eligible) {
    const day = new Date(entry.kickoff ?? entry.qualifiedAt ?? 0).toISOString().slice(0, 10);
    // Celý herní den je jeden blok; všechny výběry stejného fixture tak vždy cestují
    // spolu a zároveň se zachová korelace napříč zápasy téhož dne.
    const key = day;
    blocks.set(key, [...(blocks.get(key) ?? []), entry.priceClv!]);
  }
  const values = [...blocks.values()];
  let seed = eligible.length * 2246822519;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const samples: number[] = [];
  for (let run = 0; run < 2000; run++) {
    const sampled: number[] = [];
    for (let i = 0; i < values.length; i++) sampled.push(...values[Math.floor(random() * values.length)]);
    samples.push(sampled.reduce((sum, value) => sum + value, 0) / sampled.length);
  }
  samples.sort((a, b) => a - b);
  return { low: samples[Math.floor(samples.length * .025)], high: samples[Math.floor(samples.length * .975)] };
}

function bootstrapRoi(entries: Array<{ stake: number; profit: number }>) {
  if (entries.length < 5) return null;
  let seed = entries.length * 2654435761;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const samples: number[] = [];
  for (let run = 0; run < 2000; run++) {
    let profit = 0, stake = 0;
    for (let i = 0; i < entries.length; i++) { const row = entries[Math.floor(random() * entries.length)]; profit += row.profit; stake += row.stake; }
    samples.push(stake ? profit / stake : 0);
  }
  samples.sort((a, b) => a - b);
  return { low: samples[Math.floor(samples.length * .025)], high: samples[Math.floor(samples.length * .975)] };
}

export function summarizePortfolio(entries: PortfolioEntryInput[]): PortfolioSummary {
  const ordered = [...entries].sort((a, b) => new Date(a.qualifiedAt ?? 0).getTime() - new Date(b.qualifiedAt ?? 0).getTime());
  const settled = ordered.filter((entry) => entry.hit != null);
  const priced = settled.filter((entry) => entry.odds != null);
  const hits = settled.filter((entry) => entry.hit).length;
  const returns = priced.map((entry) => entry.hit ? entry.stake * (entry.odds! - 1) : -entry.stake);
  const profit = returns.reduce((sum, value) => sum + value, 0);
  let equity = 0, peak = 0, maxDrawdown = 0;
  for (const value of returns) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const hasFreshClose = (entry: PortfolioEntryInput) => {
    if (entry.closingMarketProbability == null) return false;
    if (entry.closingFreshness) return entry.closingFreshness === "PRIMARY_30" || entry.closingFreshness === "FALLBACK_75";
    if (!entry.kickoff || !entry.closedAt) return false;
    const minutes = (new Date(entry.kickoff).getTime() - new Date(entry.closedAt).getTime()) / 60_000;
    return minutes >= 0 && minutes <= 75;
  };
  const clv = entries.filter(hasFreshClose);
  const prospective = entries.filter((entry) => entry.clvMethodVersion === 2);
  const primary = prospective.filter((entry) => entry.closingFreshness === "PRIMARY_30");
  const fallback = prospective.filter((entry) => entry.closingFreshness === "PRIMARY_30" || entry.closingFreshness === "FALLBACK_75");
  // Ekonomickou validacni metriku tvori jen srovnatelny primary closing z panelu.
  // Fallback a single-book zustavaji diagnostikou, nikoli dukazem edge.
  const pricedClv = prospective.filter((entry) =>
    entry.priceClv != null &&
    entry.sameBookClv === true &&
    entry.closingFreshness === "PRIMARY_30" &&
    entry.benchmarkQuality === "PANEL"
  );
  const panel = fallback.filter((entry) => entry.benchmarkQuality === "PANEL");
  const priceClvConfidence95 = blockBootstrapClv(pricedClv);
  const averagePriceClv = pricedClv.length ? pricedClv.reduce((sum, entry) => sum + entry.priceClv!, 0) / pricedClv.length : null;
  const gateReason = prospective.length < 200 ? "MIN_SAMPLE_200"
    : primary.length / prospective.length < .8 ? "COVERAGE_30_BELOW_80"
    : panel.length / Math.max(1, fallback.length) < .7 ? "PANEL_COVERAGE_BELOW_70"
    : !priceClvConfidence95 || priceClvConfidence95.low <= 0 ? "PRICE_CLV_CI_NOT_POSITIVE"
    : pricedClv.filter((entry) => entry.priceClv! > 0).length / Math.max(1, pricedClv.length) <= .5 ? "POSITIVE_CLV_RATE_NOT_ABOVE_50"
    : "REQUIRES_HOLDOUT_AND_SEGMENT_VALIDATION";
  return {
    total: entries.length,
    pending: entries.length - settled.length,
    settled: settled.length,
    hits,
    accuracy: settled.length ? hits / settled.length : null,
    staked: priced.reduce((sum, entry) => sum + entry.stake, 0),
    profit,
    roi: priced.length ? profit / priced.reduce((sum, entry) => sum + entry.stake, 0) : null,
    averageOdds: priced.length ? priced.reduce((sum, entry) => sum + entry.odds!, 0) / priced.length : null,
    averageClv: clv.length ? clv.reduce((sum, entry) => sum + entry.closingMarketProbability! - entry.marketProbability, 0) / clv.length : null,
    clvComplete: clv.length,
    maxDrawdown,
    roiConfidence95: bootstrapRoi(priced.map((entry, index) => ({ stake: entry.stake, profit: returns[index] }))),
    averagePriceClv,
    priceClvPositiveRate: pricedClv.length ? pricedClv.filter((entry) => entry.priceClv! > 0).length / pricedClv.length : null,
    priceClvConfidence95,
    coverage30: prospective.length ? primary.length / prospective.length : 0,
    coverage75: prospective.length ? fallback.length / prospective.length : 0,
    panelCoverage: fallback.length ? panel.length / fallback.length : 0,
    clvMethodVersion: 2,
    gateReason,
  };
}
