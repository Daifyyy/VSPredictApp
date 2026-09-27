import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { fixturePrediction: { findUnique: vi.fn(), findMany: vi.fn() }, matchFlowEvaluationSnapshot: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() }, matchStatCache: { findMany: vi.fn() }, liveMatchSnapshot: { findFirst: vi.fn() } } }));
import { prisma } from "@/lib/db";
import { liveMatchFlowEvaluation, settleMatchFlowEvaluation, repairRecentMatchFlowEvaluations } from "./matchFlowStore";
import { buildPerformancePressureShadowV5 } from "@/lib/picks/performancePressureShadowV5";
describe("flow version routing", () => {
  beforeEach(() => vi.resetAllMocks());
  it("evaluates a frozen v5 snapshot while preserving its version", async () => {
    const pressure = buildPerformancePressureShadowV5({ homeValues: [], awayValues: [], currentLambdaHome: 1.3, currentLambdaAway: 2.9, currentOver25: .8 });
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue({ inputSnapshot: { performancePressure: pressure } } as never);
    const result = await liveMatchFlowEvaluation(1, { minute: 90, status: "FT", home: { XG: 1, SHOTS: 15 }, away: { XG: 1.3, SHOTS: 17 }, goals: { home: 0, away: 1 }, redCards: 0 });
    expect(result?.pressureVersion).toBe(5);
    expect(result?.components.find(row => row.key === "FINISHING")?.expected).toBe(2.3);
  });
  const fixture = () => ({ fixtureId: 1, leagueId: 1, kickoff: new Date("2026-09-20T12:00:00Z"), homeTeamId: 10, awayTeamId: 20, homeGoals: 1, awayGoals: 0, status: "FT", inputSnapshot: { performancePressure: buildPerformancePressureShadowV5({ homeValues: [], awayValues: [], currentLambdaHome: 1.3, currentLambdaAway: 2.9, currentOver25: .8, capturedAt: new Date("2026-09-20T10:00:00Z") }) } });
  it("does not rewrite settled audits or fetch their stats again", async () => {
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue(fixture() as never);
    vi.mocked(prisma.matchFlowEvaluationSnapshot.findUnique).mockResolvedValue({ status: "SETTLED" } as never);
    expect(await settleMatchFlowEvaluation(1)).toBe("SETTLED");
    expect(prisma.matchStatCache.findMany).not.toHaveBeenCalled();
    expect(prisma.matchFlowEvaluationSnapshot.upsert).not.toHaveBeenCalled();
  });
  it("keeps missing stats pending and settles once delayed final stats arrive", async () => {
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue(fixture() as never);
    vi.mocked(prisma.matchFlowEvaluationSnapshot.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.liveMatchSnapshot.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.matchStatCache.findMany).mockResolvedValue([{ teamId: 10 }, { teamId: 20 }] as never);
    expect(await settleMatchFlowEvaluation(1)).toBe("PENDING");
    vi.mocked(prisma.matchStatCache.findMany).mockResolvedValue([{ teamId: 10, shots: 10, xg: 1 }, { teamId: 20, shots: 14, xg: 1.3 }] as never);
    expect(await settleMatchFlowEvaluation(1)).toBe("SETTLED");
    const saved = vi.mocked(prisma.matchFlowEvaluationSnapshot.upsert).mock.calls.at(-1)![0];
    expect(saved.create.pressureVersion).toBe(5);
    expect(saved.create.status).toBe("SETTLED");
    expect(saved.update).not.toHaveProperty("expectation");
  });
  it("rejects a post-kickoff snapshot", async () => {
    const invalid = fixture(); invalid.inputSnapshot.performancePressure.capturedAt = invalid.kickoff.toISOString();
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue(invalid as never);
    expect(await settleMatchFlowEvaluation(1)).toBe("SKIPPED");
    expect(prisma.matchStatCache.findMany).not.toHaveBeenCalled();
  });
  it("repairs old pending fixtures even outside the recent window", async () => {
    vi.mocked(prisma.matchFlowEvaluationSnapshot.findMany).mockResolvedValueOnce([{ fixtureId: 1 }] as never).mockResolvedValueOnce([]);
    vi.mocked(prisma.fixturePrediction.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([fixture()] as never);
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue(fixture() as never);
    vi.mocked(prisma.matchFlowEvaluationSnapshot.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.matchStatCache.findMany).mockResolvedValue([{ teamId: 10, shots: 10 }, { teamId: 20, shots: 12 }] as never);
    vi.mocked(prisma.liveMatchSnapshot.findFirst).mockResolvedValue(null);
    expect(await repairRecentMatchFlowEvaluations(new Date("2026-10-21T00:00:00Z"))).toBe(1);
  });
  it("bounds repair work and reserves capacity for both pending and new fixtures", async () => {
    const old = Array.from({ length: 10 }, (_, index) => ({ ...fixture(), fixtureId: index + 1 }));
    const recent = Array.from({ length: 100 }, (_, index) => ({ ...fixture(), fixtureId: index + 11 }));
    vi.mocked(prisma.matchFlowEvaluationSnapshot.findMany).mockResolvedValueOnce(old.map(row => ({ fixtureId: row.fixtureId })) as never).mockResolvedValueOnce([]);
    vi.mocked(prisma.fixturePrediction.findMany).mockResolvedValueOnce(recent as never).mockResolvedValueOnce(old as never);
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue(fixture() as never);
    vi.mocked(prisma.matchFlowEvaluationSnapshot.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.matchStatCache.findMany).mockResolvedValue([{ teamId: 10, shots: 10 }, { teamId: 20, shots: 12 }] as never);
    vi.mocked(prisma.liveMatchSnapshot.findFirst).mockResolvedValue(null);
    expect(await repairRecentMatchFlowEvaluations()).toBe(10);
    const ids = vi.mocked(prisma.fixturePrediction.findUnique).mock.calls.map(call => call[0].where.fixtureId!);
    expect(ids.filter(id => id <= 10)).toHaveLength(5);
    expect(ids.filter(id => id > 10)).toHaveLength(5);
  });
});
