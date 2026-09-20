import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { fixturePrediction: { findUnique: vi.fn() } } }));
import { prisma } from "@/lib/db";
import { liveMatchFlowEvaluation } from "./matchFlowStore";
import { buildPerformancePressureShadowV5 } from "@/lib/picks/performancePressureShadowV5";
describe("flow version routing", () => {
  it("evaluates a frozen v5 snapshot while preserving its version", async () => {
    const pressure = buildPerformancePressureShadowV5({ homeValues: [], awayValues: [], currentLambdaHome: 1.3, currentLambdaAway: 2.9, currentOver25: .8 });
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue({ inputSnapshot: { performancePressure: pressure } } as never);
    const result = await liveMatchFlowEvaluation(1, { minute: 90, status: "FT", home: { XG: 1, SHOTS: 15 }, away: { XG: 1.3, SHOTS: 17 }, goals: { home: 0, away: 1 }, redCards: 0 });
    expect(result?.pressureVersion).toBe(5);
    expect(result?.components.find(row => row.key === "FINISHING")?.expected).toBe(2.3);
  });
});
