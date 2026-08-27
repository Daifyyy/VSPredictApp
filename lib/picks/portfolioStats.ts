export interface PortfolioEntryInput {
  strategy: string;
  stake: number;
  odds: number | null;
  hit: boolean | null;
  marketProbability: number;
  closingMarketProbability: number | null;
  qualifiedAt?: string | Date | null;
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
  const clv = entries.filter((entry) => entry.closingMarketProbability != null);
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
  };
}
