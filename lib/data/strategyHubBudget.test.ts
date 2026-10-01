import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ cache: vi.fn(), tips: vi.fn(), fixtures: vi.fn(), query: vi.fn(), signals: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: {
  apiCache: { findUnique: mocks.cache }, autonomousTipSnapshot: { findMany: mocks.tips }, fixturePrediction: { findMany: mocks.fixtures },
  $queryRaw: mocks.query, marketSignalSnapshot: { findMany: mocks.signals },
} }));
vi.mock('@/lib/data/intuitionTicketStore', () => ({ previewIntuitionTickets: vi.fn() }));
import { strategyHubData } from './strategyHubStore';
import { summarizePortfolio } from '../picks/portfolioStats';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('stored strategy accounting', () => {
  it('renders the same v5 card from the small projection without fetching full snapshots', async () => {
    vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
    const metrics = { all: summarizePortfolio([]), recent: summarizePortfolio([]), selectionAccuracy: null, unit: 'SELECTIONS' };
    mocks.cache.mockResolvedValue({ payload: { metrics, asOf: new Date().toISOString() } });
    mocks.signals.mockResolvedValue([]);
    mocks.query.mockResolvedValue([{
      fixtureId: 123, leagueId: 39, kickoff: new Date('2026-10-02T18:00:00Z'), homeName: 'Home', awayName: 'Away',
      pressure: { version: 5, goalLambda: { home: 1.6, away: 1.1 }, featureCoverage: .83, fallbacks: ['MISSING_ALLOWED_VOLUME'],
        marketProbabilities: { OVER_25: .51, BTTS_YES: .53, TEAM_HOME_05: .8, TEAM_HOME_15: .47, TEAM_AWAY_05: .67, TEAM_AWAY_15: .3 },
        expectedMatchShape: {
          home: { shots: { value: 14, interval: { low: 8, high: 20 } }, chanceShare: { value: .6 } },
          away: { shots: { value: 10, interval: { low: 5, high: 15 } }, chanceShare: { value: .4 } },
          opennessLabel: 'NORMAL',
        },
      },
    }]);
    const data = await strategyHubData('PRESSURE_FLOW_V5', '2026-10-02');
    expect(data.predictions).toEqual([expect.objectContaining({
      fixtureId: 123, expectedGoals: { home: 1.6, away: 1.1 },
      expectedShots: { home: 14, away: 10, low: 13, high: 35 },
      probabilities: { over25: .51, btts: .53, home05: .8, home15: .47, away05: .67, away15: .3 },
      tempo: 'NORMAL', dominance: { side: 'HOME', share: .6 }, confidence: .83, warnings: ['MISSING_ALLOWED_VOLUME'],
    })]);
    expect(data.metrics).toEqual(metrics);
    expect(mocks.fixtures).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it('does not substitute a zero balance or scan ledgers when the report is missing', async () => {
    vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
    mocks.cache.mockResolvedValue(null);
    await expect(strategyHubData('ONE_X_TWO', '2026-10-01')).rejects.toThrow('STRATEGY_METRICS_NOT_CAPTURED');
    expect(mocks.tips).not.toHaveBeenCalled();
  });
  it('reads only the requested day and uses the stored historical balance unchanged', async () => {
    vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
    const metrics = { all: summarizePortfolio([]), recent: summarizePortfolio([]), selectionAccuracy: null, unit: 'SELECTIONS' };
    mocks.cache.mockResolvedValue({ payload: { metrics, asOf: new Date().toISOString() } });
    mocks.tips.mockResolvedValue([]);
    const data = await strategyHubData('OVER_25', '2026-10-01');
    expect(data.metrics).toEqual(metrics);
    expect(mocks.tips.mock.calls[0][0].where.kickoff).toEqual({ gte: expect.any(Date), lt: expect.any(Date) });
    expect(mocks.tips.mock.calls[0][0].select.modelInputSnapshot).toBeUndefined();
    await strategyHubData('OVER_25', '2026-10-01');
    expect(mocks.tips).toHaveBeenCalledTimes(1);
  });
});
