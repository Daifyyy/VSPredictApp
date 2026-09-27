import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: { autonomousTipSnapshot: { findMany: vi.fn() }, marketSignalSnapshot: { findMany: vi.fn() }, fixturePrediction: { findMany: vi.fn() }, matchStatCache: { findMany: vi.fn() } } }));
import { prisma } from "../db";
import { loadModelStrategyLedger } from "./modelStrategyLedger";
import { modelLabSummary } from "../picks/modelLab";

describe("shared strategy ledger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.autonomousTipSnapshot.findMany).mockResolvedValue([]);
    vi.mocked(prisma.marketSignalSnapshot.findMany).mockResolvedValue([]);
    vi.mocked(prisma.fixturePrediction.findMany).mockResolvedValue([]);
    vi.mocked(prisma.matchStatCache.findMany).mockResolvedValue([]);
  });
  it("loads all definitions with one batched query per source and exact versions", async () => {
    await loadModelStrategyLedger("EURO_CUP");
    expect(prisma.autonomousTipSnapshot.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.marketSignalSnapshot.findMany).toHaveBeenCalledTimes(1);
    const where = vi.mocked(prisma.marketSignalSnapshot.findMany).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ OR: expect.arrayContaining([{ policyVersion: 501, modelVersion: 5, modelContext: "EURO_CUP", contextVersion: 2, countModelVersion: null }]) });
    expect(prisma.fixturePrediction.findMany).not.toHaveBeenCalled();
  });
  it("scores fouls using both teams and preserves stored settlement", async () => {
    const kickoff = new Date("2026-09-20T12:00:00Z");
    vi.mocked(prisma.autonomousTipSnapshot.findMany).mockResolvedValue([{ id: "a", fixtureId: 1, leagueId: 39, kickoff, homeTeamId: 10, awayTeamId: 20, strategy: "FOULS", policyVersion: 1, market: "FOULS", side: "OVER", line: 20.5, stake: 1, decimalOdds: 2, modelProbability: .65, marketProbability: .5, modelContext: "LEAGUE", modelVersion: 7, qualifiedAt: new Date("2026-09-20T10:00:00Z"), hit: null, actualCount: null, closedAt: null, closingMarketProbability: null }] as never);
    vi.mocked(prisma.fixturePrediction.findMany).mockResolvedValue([{ fixtureId: 1, homeTeamId: 10, awayTeamId: 20, homeGoals: 0, awayGoals: 0, status: "FT" }] as never);
    vi.mocked(prisma.matchStatCache.findMany).mockResolvedValue([{ fixtureId: 1, teamId: 10, fouls: 12 }, { fixtureId: 1, teamId: 20, fouls: 11 }] as never);
    const { ledger } = await loadModelStrategyLedger("LEAGUE", "FOULS");
    expect(ledger[0].actualCount).toBe(23);
    expect(modelLabSummary(ledger).portfolio.profit).toBe(1);
    expect(prisma.matchStatCache.findMany).toHaveBeenCalledTimes(1);
  });
});
