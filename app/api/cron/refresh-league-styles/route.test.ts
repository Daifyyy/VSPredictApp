import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLeagueStyleSnapshot, refreshLeagueStyleSnapshot } = vi.hoisted(() => ({
  getLeagueStyleSnapshot: vi.fn(), refreshLeagueStyleSnapshot: vi.fn(),
}));
vi.mock("@/lib/cronAuth", () => ({ requireCronAuth: () => null }));
vi.mock("@/lib/db", () => ({ isRealDataConfigured: () => true }));
vi.mock("@/lib/data/realRepository", () => ({ getLeagueStyleSnapshot, refreshLeagueStyleSnapshot }));

describe("GET /api/cron/refresh-league-styles", () => {
  beforeEach(() => { getLeagueStyleSnapshot.mockReset(); refreshLeagueStyleSnapshot.mockReset(); });
  it("bez cold povolení nespustí drahou inicializaci", async () => {
    getLeagueStyleSnapshot.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/refresh-league-styles?league=39"));
    expect(response.status).toBe(202);
    expect(refreshLeagueStyleSnapshot).not.toHaveBeenCalled();
  });
  it("povolenou studenou ligu inicializuje", async () => {
    getLeagueStyleSnapshot.mockResolvedValue(null);
    refreshLeagueStyleSnapshot.mockResolvedValue({ updatedAt: "2026-08-04T00:00:00.000Z", coverage: {} });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/refresh-league-styles?league=39&cold=1"));
    expect(response.status).toBe(200);
    expect(refreshLeagueStyleSnapshot).toHaveBeenCalledWith(39);
  });
});
