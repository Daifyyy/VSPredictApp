import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {
  clubEloMatch: { findMany: vi.fn() }, fixturePrediction: { findMany: vi.fn() },
} }));
import { prisma } from "@/lib/db";
import { loadSeasonResults } from "./seasonResults";
describe("season result reader", () => {
  it("batches leagues in two reads and merges completed predictions missing in Elo", async () => {
    vi.mocked(prisma.clubEloMatch.findMany).mockResolvedValue([]);
    vi.mocked(prisma.fixturePrediction.findMany).mockResolvedValue([{
      fixtureId: 1, leagueId: 39, season: 2026, kickoff: new Date("2026-09-10"),
      homeTeamId: 1, awayTeamId: 2, homeGoals: 0, awayGoals: 0, status: "FT",
    }] as never);
    const result = await loadSeasonResults([39, 88, 144], 2023, new Date("2026-09-20"));
    expect(result.matches).toHaveLength(1);
    expect(prisma.clubEloMatch.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.fixturePrediction.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clubEloMatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ leagueId: { in: [39, 88, 144] }, season: { gte: 2023 } }),
    }));
  });
});
