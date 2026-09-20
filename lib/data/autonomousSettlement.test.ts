import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {
  fixturePrediction: { findUnique: vi.fn() },
  autonomousTipSnapshot: { findMany: vi.fn(), updateMany: vi.fn() },
} }));
import { prisma } from "@/lib/db";
import { settleAutonomousPortfolio } from "./autonomousPortfolioStore";

describe("goal portfolio settlement", () => {
  beforeEach(() => vi.resetAllMocks());
  it("does not settle a live score", async () => {
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue({ status: "2H", homeGoals: 0, awayGoals: 1 } as never);
    expect(await settleAutonomousPortfolio(1, new Date())).toBe(0);
    expect(prisma.autonomousTipSnapshot.updateMany).not.toHaveBeenCalled();
  });
  it("settles old goal policies from FT and preserves the frozen selection", async () => {
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue({ status: "FT", homeGoals: 0, awayGoals: 1 } as never);
    vi.mocked(prisma.autonomousTipSnapshot.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "over", market: "OVER_25", side: "OVER", line: 2.5, decimalOdds: 1.53, stake: 1 },
      { id: "away", market: "1X2", side: "AWAY", line: null, decimalOdds: 2.59, stake: 1 },
      { id: "btts", market: "BTTS", side: "OVER", line: null, decimalOdds: 1.44, stake: 1 },
    ] as never);
    vi.mocked(prisma.autonomousTipSnapshot.updateMany).mockResolvedValue({ count: 1 });
    expect(await settleAutonomousPortfolio(1, new Date())).toBe(3);
    const writes = vi.mocked(prisma.autonomousTipSnapshot.updateMany).mock.calls.map(([args]) => args);
    expect(writes[0]).toMatchObject({ where: { id: "over", settledAt: null }, data: { hit: false, profit: -1, settlementStatus: "SETTLED" } });
    expect(writes[1]?.data.profit).toBeCloseTo(1.59);
    expect(writes[2]?.data.hit).toBe(false);
    expect(writes.every(row => !("modelProbability" in row.data) && !("decimalOdds" in row.data))).toBe(true);
  });
});
