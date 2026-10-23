import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ fixture: vi.fn(), forecasts: vi.fn(), create: vi.fn(), signals: vi.fn(), signalCreate: vi.fn(),
  cacheRead: vi.fn(), cacheWrite: vi.fn(), cacheDelete: vi.fn(), execute: vi.fn(), query: vi.fn(), build: vi.fn() }));
vi.mock('../db', () => ({ prisma: { fixturePrediction: { findMany: mocks.fixture }, aIForecastSnapshot: { findMany: mocks.forecasts, createMany: mocks.create },
  marketSignalSnapshot: { findMany: mocks.signals, createMany: mocks.signalCreate }, apiCache: { findUnique: mocks.cacheRead, upsert: mocks.cacheWrite, deleteMany: mocks.cacheDelete },
  $executeRaw: mocks.execute, $queryRaw: mocks.query } }));
vi.mock('../operations', () => ({ upsertIncident: vi.fn() }));
vi.mock('../picks/aiProduction', async () => ({ ...await import('../picks/aiIdentity'), buildAIBaseForecasts: mocks.build }));
import { readAIResearchDay, runAIResearch } from './aiResearchStore';
const now = new Date('2026-10-24T07:00:00Z');
function fixtures(n: number) { return Array.from({ length: n }, (_, i) => ({ id: `forecast-${i+1}`, fixtureId: i+1, leagueId: 39, season: 2026,
  homeTeamId: 100+i, awayTeamId: 200+i, homeName: 'Home', awayName: 'Away', kickoff: new Date('2026-10-24T15:00:00Z'),
  capturedAt: now, status: 'NS', available: true, modelContext: 'LEAGUE', outcome: 'PENDING', homeGoals: null, awayGoals: null,
  probability: .65, coverage: 1, homeSample: 10, awaySample: 10,
  oddsCurrentAt: now, oddsCurrentBooks: [{ id: 4, name: 'Pinnacle', over25: 1.9, under25: 1.9 }] })); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('AI_RESEARCH_INFERENCE_ENABLED', 'true'); vi.stubEnv('AI_RESEARCH_OPPORTUNITIES_ENABLED', 'true');
  mocks.execute.mockResolvedValue(1); mocks.create.mockResolvedValue({ count: 1 }); mocks.signalCreate.mockResolvedValue({ count: 1 });
  mocks.cacheRead.mockResolvedValue(null); mocks.cacheWrite.mockResolvedValue({}); mocks.cacheDelete.mockResolvedValue({ count: 1 });
  mocks.signals.mockResolvedValue([]); mocks.query.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
describe('AI research persistence', () => {
  it('reverifies an identical live book price but never a changed price or accounting timestamp', async () => {
    const rows = fixtures(1); mocks.fixture.mockResolvedValue(rows); mocks.forecasts.mockResolvedValue(rows);
    const quotedAt = new Date('2026-10-23T12:00:00Z');
    mocks.signals.mockResolvedValue([{ id: 'signal', fixtureId: 1, decimalOdds: 1.9, bookmaker: 'Pinnacle', quotedAt, priceClv: null }]);
    await runAIResearch(now);
    const first = mocks.cacheWrite.mock.calls[0][0].create.payload.picks[0];
    expect(first).toMatchObject({ quotedAt: quotedAt.toISOString(), verifiedAt: now.toISOString(), currentEligible: true });
    mocks.cacheWrite.mockClear();
    mocks.fixture.mockResolvedValue([{ ...rows[0], oddsCurrentBooks: [{ name: 'Pinnacle', over25: 1.95, under25: 1.9 }] }]);
    await runAIResearch(now);
    expect(mocks.cacheWrite.mock.calls[0][0].create.payload.picks[0]).toMatchObject({ odds: 1.9, quotedAt: quotedAt.toISOString(), currentEligible: false });
  });
  it.each([1, 50])('uses a fixed number of batch reads for %i fixtures and insert-only forecasts/quotes', async n => {
    const rows = fixtures(n); mocks.fixture.mockResolvedValue(rows);
    mocks.forecasts.mockImplementation(async args => args.select?.fixtureId ? [] : rows);
    mocks.build.mockReturnValue({ output: rows.map(r => ({ fixtureId: r.fixtureId, probability: r.probability, coverage: 1, homeSample: 10, awaySample: 10, inputHash: 'test', inputAudit: {} })), rejected: [] });
    const result = await runAIResearch(now);
    expect(result.status).toBe('COMPLETED');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: expect.any(Array) }));
    expect(mocks.create.mock.calls[0][0].data).toHaveLength(n);
    expect(mocks.signalCreate.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
    expect(mocks.signalCreate.mock.calls[0][0].data).toHaveLength(n);
    expect(mocks.fixture).toHaveBeenCalledTimes(2); // History and current quotes; no per-fixture query.
    expect(mocks.forecasts).toHaveBeenCalledTimes(4);
    expect(mocks.cacheDelete).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ key: 'ai-research:lease:v1', payload: expect.any(Object) }) }));
  });
  it('does not overwrite a previously captured prediction on the next run', async () => {
    const rows = fixtures(1); mocks.fixture.mockResolvedValue(rows); mocks.forecasts.mockResolvedValue(rows);
    await runAIResearch(now);
    expect(mocks.build).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does no work under another lease', async () => {
    mocks.execute.mockResolvedValue(0);
    expect(await runAIResearch(now)).toEqual({ status: 'LEASE_HELD' }); expect(mocks.fixture).not.toHaveBeenCalled();
  });
  it('serves only a stored projection, never inference or historical aggregates', async () => {
    expect(await readAIResearchDay('2026-10-24')).toBeNull();
    expect(mocks.build).not.toHaveBeenCalled(); expect(mocks.forecasts).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it('settles with the common market rule, without mutating prediction fields', async () => {
    const rows = fixtures(1); mocks.fixture.mockResolvedValue([{ ...rows[0], status: 'FT', homeGoals: 1, awayGoals: 1 }]); mocks.forecasts.mockResolvedValue(rows);
    await runAIResearch(now, true);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.signalCreate).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledTimes(2); // lease plus one bulk settlement
    const values = mocks.execute.mock.calls[1].slice(1).flatMap(v => typeof v === 'object' && v && 'values' in v ? v.values : [v]);
    expect(JSON.stringify(values)).toContain('LOST');
  });
});
