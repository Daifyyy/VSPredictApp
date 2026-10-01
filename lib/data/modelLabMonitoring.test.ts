import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  reviews: vi.fn(), reviewWrite: vi.fn(), summary: vi.fn(), definitions: vi.fn(),
  metrics: vi.fn(), pressure: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: {
  modelStrategyReviewReport: { findMany: m.reviews, upsert: m.reviewWrite },
  modelStrategyDefinition: { upsert: m.definitions },
  modelStrategyMetricSnapshot: { upsert: m.metrics },
  modelDegradationIncident: { findFirst: vi.fn().mockResolvedValue(null) },
} }));
vi.mock('./modelStrategyLedger', () => ({
  MODEL_LAB_REPORT_VERSION: 2, loadModelStrategyLedger: vi.fn().mockResolvedValue({ ledger: [] }),
}));
vi.mock('./pressurePerformanceStore', () => ({ refreshPressurePerformance: m.pressure }));
vi.mock('@/lib/operations', () => ({ upsertIncident: vi.fn(), resolveIncident: vi.fn() }));
vi.mock('@/lib/picks/modelLab', () => ({
  STRATEGY_CATALOG: [{ strategy: 'OVER_25', policyVersion: 1, status: 'RESEARCH' }],
  modelLabSummary: m.summary, resolveModelLabStatus: () => 'RESEARCH',
}));
import { monitorModelLab } from './modelLabMonitoring';
beforeEach(() => {
  vi.clearAllMocks();
  m.summary.mockReturnValue({ portfolio: { settled: 200 }, probability: { model: { n: 200, logLoss: null } }, gates: {} });
  m.definitions.mockImplementation(async (args) => ({ id: args.create.modelContext, status: 'RESEARCH' }));
});
it('does not recompute or write immutable milestones, but refreshes current metrics and v5', async () => {
  m.reviews.mockResolvedValue(['LEAGUE', 'EURO_CUP', 'NATIONAL'].flatMap(definitionId =>
    [50, 100, 200].map(milestone => ({ definitionId, milestone }))));
  expect(await monitorModelLab()).toEqual({ reports: 9, findings: 0 });
  expect(m.reviews).toHaveBeenCalledExactlyOnceWith({ select: { definitionId: true, milestone: true } });
  expect(m.reviewWrite).not.toHaveBeenCalled();
  expect(m.summary).toHaveBeenCalledTimes(9); // current, recent, baseline per context
  expect(m.metrics).toHaveBeenCalledTimes(3);
  expect(m.pressure).toHaveBeenCalledTimes(1);
});
it('computes missing milestones with the unchanged immutable upsert', async () => {
  m.reviews.mockResolvedValue([]);
  expect(await monitorModelLab()).toEqual({ reports: 9, findings: 0 });
  expect(m.reviewWrite).toHaveBeenCalledTimes(9);
  expect(m.summary).toHaveBeenCalledTimes(18);
  for (const [args] of m.reviewWrite.mock.calls) expect(args.update).toEqual({});
});
