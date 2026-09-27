import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./personnelShadow", () => ({ personnelShadowDashboard: vi.fn(async () => ({})) }));
vi.mock("./quickOverviewAudit", () => ({ quickOverviewCaptureAudit: vi.fn(async () => ({})) }));
vi.mock("@/lib/db", () => ({ prisma: {
  fixturePrediction: { findMany: vi.fn() }, modelStrategyDefinition: { findMany: vi.fn() },
  modelStrategyMetricSnapshot: { findMany: vi.fn() },
  calibrationCheckpoint: { findMany: vi.fn() }, dataIncident: { findMany: vi.fn() },
  autonomousTipSnapshot: { groupBy: vi.fn(), findMany: vi.fn() }, mainModelShadowPrediction: { findMany: vi.fn() },
  apiCache: { findUnique: vi.fn() }, matchFlowEvaluationSnapshot: { findMany: vi.fn() },
} }));
import { prisma } from "@/lib/db";
import { getModelGovernanceDashboard } from "./modelGovernance";
import { buildPerformancePressureShadowV5 } from "@/lib/picks/performancePressureShadowV5";
describe("v5 governance cohort", () => {
  beforeEach(() => vi.resetAllMocks());
  it("uses actual v5 probabilities for scores, recent rows and deltas; requests v5 flow", async () => {
    vi.mocked(prisma.modelStrategyDefinition.findMany).mockResolvedValue([]);
    vi.mocked(prisma.modelStrategyMetricSnapshot.findMany).mockResolvedValue([{ strategy: "OVER_25", policyVersion: 2, modelVersion: 7, metrics: { reportVersion: 2, summary: { portfolio: { settled: 7 } } } }] as never);
    vi.mocked(prisma.calibrationCheckpoint.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dataIncident.findMany).mockResolvedValue([]);
    vi.mocked(prisma.autonomousTipSnapshot.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.autonomousTipSnapshot.findMany).mockResolvedValue([]);
    vi.mocked(prisma.mainModelShadowPrediction.findMany).mockResolvedValue([]);
    vi.mocked(prisma.apiCache.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.matchFlowEvaluationSnapshot.findMany).mockResolvedValue([]);
    const pressure = buildPerformancePressureShadowV5({ homeValues: [], awayValues: [], currentLambdaHome: 1.3, currentLambdaAway: 1.2, currentOver25: .6, capturedAt: new Date("2026-09-20T10:00:00Z") });
    pressure.marketProbabilities.OVER_25 = .2;
    pressure.shadowOver25 = .9;
    pressure.over25Delta = .3;
    const fixture = { fixtureId: 1, kickoff: new Date("2026-09-20T12:00:00Z"), homeName: "Home", awayName: "Away", status: "FT", homeGoals: 1, awayGoals: 0, inputSnapshot: { performancePressure: pressure } };
    vi.mocked(prisma.fixturePrediction.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([fixture] as never);
    const dashboard = await getModelGovernanceDashboard();
    expect(dashboard.performancePressure.shadow.brier).toBeCloseTo(.04);
    expect(dashboard.performancePressure.current.brier).toBeCloseTo(.36);
    expect(dashboard.performancePressure.averageOverDelta).toBeCloseTo(-.4);
    expect(dashboard.performancePressure.recent[0].shadowOver25).toBe(.2);
    expect(dashboard.performancePressure.evaluation.cohorts[0].markets.BTTS_YES.baseline.n).toBe(0);
    expect(prisma.matchFlowEvaluationSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ pressureVersion: 5 }) }));
    expect(dashboard.matchFlow.pressureVersion).toBe(5);
    expect(dashboard.strategies.find(row => row.strategy === "OVER_25")?.sample).toBe(7);
  });
});
