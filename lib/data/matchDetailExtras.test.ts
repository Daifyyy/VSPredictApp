import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ source: vi.fn(), final: vi.fn(), sql: vi.fn(), build: vi.fn(), public: vi.fn(), live: vi.fn(), legs: vi.fn(), evaluate: vi.fn() }));
vi.mock('./dailySourceAudit', () => ({ dailySourceAudit: mocks.source }));
vi.mock('../db', () => ({ prisma: { matchFlowEvaluationSnapshot: { findUnique: mocks.final }, liveMatchSnapshot: { findFirst: mocks.live }, intuitionTicketLeg: { findMany: mocks.legs }, $queryRaw: mocks.sql } }));
vi.mock('../picks/matchFlowEvaluation', () => ({ MATCH_FLOW_EVALUATION_VERSION: 3, evaluateMatchFlow: mocks.evaluate }));
vi.mock('../picks/matchInsight', () => ({ buildMatchInsight: mocks.build, publicMatchInsight: mocks.public }));
import { readDetailInsight, readDetailPublications, readDetailTicketLegs } from './matchDetailExtras';
const kickoff = new Date('2026-10-31T18:00:00Z');
const pressure = { version: 5, capturedAt: '2026-10-31T08:00:00Z', expectedMatchShape: {} };
beforeEach(() => { vi.clearAllMocks(); mocks.source.mockResolvedValue(new Map([[1, { competition: { homeTeamId: 10, awayTeamId: 20 }, performancePressure: pressure }]])); mocks.final.mockResolvedValue(null); mocks.build.mockReturnValue({ private: true }); mocks.public.mockReturnValue({ public: true }); });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T18:10:00Z')); mocks.live.mockResolvedValue(null); mocks.legs.mockResolvedValue([]); mocks.evaluate.mockReturnValue({ final: false }); });
afterEach(() => vi.useRealTimers());
it('keeps prematch expectations while a match is running without reading live tables', async () => {
  const result = await readDetailInsight(1, kickoff, '1H', false, 10, 20);
  expect(result.reason).toBe('AWAITING_FINAL_RESULT');
  expect(mocks.live).not.toHaveBeenCalled();
  expect(mocks.evaluate).not.toHaveBeenCalled();
  expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ phase: 'PREMATCH', evaluation: null }));
});
it('reads bounded ticket legs only for PRO without copying source histories', async () => {
  expect(await readDetailTicketLegs(1, false)).toEqual([]);
  expect(mocks.legs).not.toHaveBeenCalled();
  await readDetailTicketLegs(1, true);
  const query = mocks.legs.mock.calls[0][0];
  expect(query.where).toEqual({ fixtureId: 1, ticket: { strategy: { in: ['VALUE', 'ELO_INTUITION'] } } });
  expect(query.take).toBe(30);
  expect(query.select.context).toBeUndefined();
});
it('uses saved final evaluation of the matching version and kickoff only', async () => {
  const evaluation = { final: true, diagnosis: { code: 'FLOW_CONFIRMED' }, components: [] };
  mocks.final.mockResolvedValue({ status: 'SETTLED', kickoff, evaluation });
  const result = await readDetailInsight(1, kickoff, 'FT', true, 10, 20);
  expect(result.reason).toBeNull();
  expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ evaluation, phase: 'FINAL' }));
  expect(mocks.final.mock.calls[0][0].where.fixtureId_pressureVersion_evaluationVersion.pressureVersion).toBe(5);
});
it('does not manufacture missing final evaluation and strips public detail', async () => {
  const result = await readDetailInsight(1, kickoff, 'FT', false, 10, 20);
  expect(result).toEqual({ insight: { public: true }, reason: 'FINAL_AUDIT_PENDING' });
  expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ evaluation: null, phase: 'PREMATCH' }));
});
it('rejects wrong team identity and post-kickoff expectation', async () => {
  expect((await readDetailInsight(1, kickoff, 'NS', true, 20, 10)).insight).toBeNull();
  expect((await readDetailInsight(1, new Date('2026-10-30'), 'NS', true, 10, 20)).insight).toBeNull();
  expect(mocks.build).not.toHaveBeenCalled();
});
it('does not load private publications for FREE and projects only necessary snapshot fields', async () => {
  expect(await readDetailPublications(1, false)).toEqual([]); expect(mocks.sql).not.toHaveBeenCalled();
  mocks.sql.mockResolvedValue([]); await readDetailPublications(1, true);
  expect(mocks.sql.mock.calls[0][0].join('')).toContain("snapshot->>'selection'");
  expect(mocks.sql.mock.calls[0][0].join('')).toContain('LIMIT 30');
});
