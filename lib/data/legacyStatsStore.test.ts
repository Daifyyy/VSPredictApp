import { beforeEach, expect, it, vi } from 'vitest';
import type { PredictionRow } from '../types';
const m = vi.hoisted(() => ({ settled: vi.fn(), published: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('./repository', () => ({ getSettledPredictionRows: m.settled, getPublishedPredictionRows: m.published }));
vi.mock('../db', () => ({ isRealDataConfigured: () => false, prisma: { apiCache: { findUnique: m.read, upsert: m.write } } }));
vi.mock('./cache', () => ({ getCachedCountTotals: vi.fn() }));
vi.mock('./marketSignalStats', () => ({ marketClvSummaries: vi.fn() }));
vi.mock('./checklistStats', () => ({ checklistPerformance: vi.fn() }));
import { LEGACY_STATS_KEY, computeLegacyStats, readLegacyStats, refreshLegacyStats } from './legacyStatsStore';
import { PICK_PRESETS } from '../picks/rules';
import { backtestRule, computeTrackRecord } from '../picks/trackRecord';
import { sharedReadCache } from '../boundedCache';
function row(over: Partial<PredictionRow> = {}): PredictionRow {
  return {
    fixtureId: 1,
    leagueId: 39,
    season: 2025,
    kickoff: new Date(Date.now() - 86400000).toISOString(),
    homeTeamId: 10,
    awayTeamId: 20,
    homeName: "Domácí",
    awayName: "Hosté",
    homeLogo: "",
    awayLogo: "",
    available: true,
    lambdaHome: 1.6,
    lambdaAway: 1.0,
    homeWin: 0.5,
    draw: 0.25,
    awayWin: 0.25,
    bttsYes: 0.5,
    over25: 0.5,
    lowConfidence: false,
    modelVersion: 1,
    rho: -0.13,
    sharpen: 1,
    calibA: 1,
    calibB: 0,
    status: "FT",
    homeGoals: 1,
    awayGoals: 0,
    benchAvailable: false,
    benchHomeWin: null,
    benchDraw: null,
    benchAwayWin: null,
    oddsBookmaker: null,
    oddsHome: null,
    oddsDraw: null,
    oddsAway: null,
    oddsOver25: null,
    oddsBtts: null,
    oddsUnder25: null,
    oddsBttsNo: null,
    oddsCloseHome: null,
    oddsCloseDraw: null,
    oddsCloseAway: null,
    oddsCloseOver25: null,
    oddsCloseUnder25: null,
    readinessSample: 10,
    ...over,
  };
}

const now = new Date('2026-10-01T12:00:00Z');
let rows: PredictionRow[];
beforeEach(() => {
  vi.clearAllMocks(); sharedReadCache.delete(LEGACY_STATS_KEY);
  rows = [
    row({ modelContext: 'LEAGUE', homeWin: .7, over25: .7, bttsYes: .7, homeGoals: 2, awayGoals: 1 }),
    row({ fixtureId: 2, modelContext: 'EURO_CUP', leagueId: 2, homeWin: .8 }),
    row({ fixtureId: 3, modelContext: 'NATIONAL', leagueId: 1, homeWin: .9 }),
  ];
  m.settled.mockResolvedValue(rows); m.published.mockResolvedValue([]); m.read.mockResolvedValue(null);
});
it('preserves original context populations and exact backtest calculations', async () => {
  const rule = PICK_PRESETS[0].rule;
  const data = await computeLegacyStats(rule);
  expect(data.trackRecord).toEqual(computeTrackRecord([rows[0]]));
  expect(data.european.trackRecord).toEqual(computeTrackRecord([rows[1]]));
  expect(data.national.trackRecord).toEqual(computeTrackRecord([rows[2]]));
  expect(data.backtest).toEqual(backtestRule([rows[0]], rule));
  expect(data.european.backtest).toEqual(backtestRule([rows[1]], rule));
});
it('loads history once for all presets and reads exact saved outputs without history access', async () => {
  await refreshLegacyStats(now);
  expect(m.settled).toHaveBeenCalledTimes(1); expect(m.published).toHaveBeenCalledTimes(1);
  const payload = m.write.mock.calls[0][0].create.payload;
  m.read.mockResolvedValue({ payload });
  for (const preset of PICK_PRESETS) {
    const stored = await readLegacyStats(preset.rule, now);
    expect(stored?.backtest).toEqual(backtestRule([rows[0]], preset.rule));
    expect(stored?.backtestLimitedReason).toBeNull();
  }
  expect(m.settled).toHaveBeenCalledTimes(1); expect(m.read).toHaveBeenCalledTimes(1);
});
it('does not silently substitute a different threshold or zero-EV rule', async () => {
  await refreshLegacyStats(now);
  m.read.mockResolvedValue({ payload: m.write.mock.calls[0][0].create.payload });
  for (const rule of [{ ...PICK_PRESETS[0].rule, minProb: .651 }, { ...PICK_PRESETS[0].rule, minEdge: 0 }]) {
    const data = await readLegacyStats(rule, now);
    expect(data?.backtest).toBeNull(); expect(data?.clv).toBeNull();
    expect(data?.backtestLimitedReason).toBe('CUSTOM_BACKTEST_NOT_PRECOMPUTED');
    expect(data?.trackRecord).toEqual(computeTrackRecord([rows[0]]));
  }
  expect(m.settled).toHaveBeenCalledTimes(1);
});
it('keeps missing and stale reports explicit', async () => {
  expect(await readLegacyStats(PICK_PRESETS[0].rule, now)).toBeNull();
  expect(m.settled).not.toHaveBeenCalled();
  await refreshLegacyStats(now);
  m.read.mockResolvedValue({ payload: m.write.mock.calls[0][0].create.payload });
  const result = await readLegacyStats(PICK_PRESETS[0].rule, new Date(+now + 27 * 3600_000));
  expect(result?.stale).toBe(true); expect(result?.limitedReason).toBe('LEGACY_STATS_STALE');
});
