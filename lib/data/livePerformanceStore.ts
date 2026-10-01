import { prisma } from '../db';
import { sharedReadCache } from '../boundedCache';

export const LIVE_PERFORMANCE_KEY = 'live-performance:v1';
const markets = ["LIVE_1X2", "LIVE_GOALS", "LIVE_BTTS"] as const;
const labels: Record<(typeof markets)[number], string> = { LIVE_1X2: "Live 1X2 v1", LIVE_GOALS: "Live góly v1", LIVE_BTTS: "Live BTTS v1" };

function summarize(rows: Array<{ hit: boolean | null; profit: number | null; modelProbability: number; minute: number }>) {
  const settled = rows.filter((row) => row.hit != null && row.profit != null);
  const profit = settled.reduce((sum, row) => sum + row.profit!, 0);
  let peak = 0, balance = 0, maxDrawdown = 0;
  for (const row of settled) { balance += row.profit!; peak = Math.max(peak, balance); maxDrawdown = Math.max(maxDrawdown, peak - balance); }
  const brier = settled.length ? settled.reduce((sum, row) => sum + (row.modelProbability - (row.hit ? 1 : 0)) ** 2, 0) / settled.length : null;
  const bands = [[15, 30], [31, 45], [46, 60], [61, 80]].map(([from, to]) => {
    const band = settled.filter((row) => row.minute >= from && row.minute <= to);
    return { label: `${from}–${to}. minuta`, sample: band.length, roi: band.length ? band.reduce((sum, row) => sum + row.profit!, 0) / band.length : null };
  });
  return { sample: settled.length, hits: settled.filter((row) => row.hit).length, profit, roi: settled.length ? profit / settled.length : null, brier, maxDrawdown, priceCompleteness: rows.length ? 1 : null, bands };
}


export async function computeLivePerformance(now = new Date(), bounded = false) {
  const rows = await prisma.liveCandidateSnapshot.findMany({ orderBy: { qualifiedAt: 'asc' }, select: { id: true, fixtureId: true, homeName: true, awayName: true, kickoff: true, market: true, side: true, line: true, minute: true, scoreHome: true, scoreAway: true, modelProbability: true, marketProbability: true, expectedValue: true, decimalOdds: true, bookmaker: true, qualifiedAt: true, settlementStatus: true, hit: true, profit: true } });
  const cards = markets.map(market => {
    const own = rows.filter(row => row.market === market);
    const current = own.filter(row => row.settlementStatus === 'PENDING');
    return { market, title: labels[market], status: 'LIVE_TEST', currentCount: current.length,
      ...summarize(own), current: bounded ? current.slice(-30) : current,
      currentTruncated: bounded && current.length > 30,
      recent: own.filter(row => row.settlementStatus !== 'PENDING').slice(-20).reverse() };
  });
  return { version: 1 as const, asOf: now.toISOString(), cards };
}
type Report = Awaited<ReturnType<typeof computeLivePerformance>>;

/** Explicit admin job only. No new cron workload until capacity is measured. */
export async function refreshLivePerformance(now = new Date()) {
  const report = await computeLivePerformance(now, true);
  const serialized = JSON.stringify(report);
  if (Buffer.byteLength(serialized, 'utf8') > 250_000) throw new Error('LIVE_REPORT_TOO_LARGE');
  const payload = JSON.parse(serialized), expiresAt = new Date(+now + 90 * 86400_000);
  await prisma.apiCache.upsert({ where: { key: LIVE_PERFORMANCE_KEY },
    create: { key: LIVE_PERFORMANCE_KEY, payload, expiresAt }, update: { payload, expiresAt } });
  sharedReadCache.delete(LIVE_PERFORMANCE_KEY);
  return { reports: 1, asOf: report.asOf };
}

export async function readLivePerformance(now = new Date()) {
  const report = await sharedReadCache.read(LIVE_PERFORMANCE_KEY, 15 * 60_000, async () => {
    const row = await prisma.apiCache.findUnique({ where: { key: LIVE_PERFORMANCE_KEY }, select: { payload: true } });
    const value = row?.payload as unknown as Report | undefined;
    return value?.version === 1 && Number.isFinite(Date.parse(value.asOf)) && Date.parse(value.asOf) <= +now
      && Array.isArray(value.cards) && value.cards.length === markets.length
      && markets.every(market => value.cards.some(card => card.market === market
        && Number.isFinite(card.sample) && Number.isFinite(card.profit)
        && Array.isArray(card.current) && card.current.length <= 30
        && Array.isArray(card.recent) && card.recent.length <= 20)) ? value : null;
  });
  const stale = !report || +now - Date.parse(report.asOf) > 26 * 3600_000;
  return { report, asOf: report?.asOf ?? null, stale,
    limitedReason: !report ? 'LIVE_PERFORMANCE_NOT_CAPTURED' : stale ? 'LIVE_PERFORMANCE_STALE' : null };
}

/** Public output is an allowlist: stored PRO picks must never leak through summary GET. */
export function publicLiveCards(report: Report) {
  return report.cards.map(card => ({
    market: card.market, title: card.title, status: card.status, currentCount: card.currentCount,
    sample: card.sample, hits: card.hits, profit: card.profit, roi: card.roi, brier: card.brier,
    maxDrawdown: card.maxDrawdown, priceCompleteness: card.priceCompleteness, bands: card.bands,
  }));
}
