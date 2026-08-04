import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeagueStyleSnapshot } from "@/lib/types";

const getLeagueStyleSnapshot = vi.fn();
vi.mock("@/lib/data/repository", () => ({ getLeagueStyleSnapshot }));
vi.mock("@/lib/rateLimit", () => ({ allowRequest: () => true, clientKey: () => "test", tooMany: () => new Response(null, { status: 429 }) }));

const snapshot: LeagueStyleSnapshot = {
  leagueId: 39, season: 2026, updatedAt: "2026-08-04T00:00:00.000Z",
  coverage: { TOTAL: { eligible: 6, total: 6 }, HOME: { eligible: 6, total: 6 }, AWAY: { eligible: 6, total: 6 } },
  rankings: Object.fromEntries(["TOTAL", "HOME", "AWAY"].map((venue) => [venue, Object.fromEntries(["possession", "buildup", "pressing", "efficiency", "defense"].map((key) => [key, Array.from({ length: 6 }, (_, index) => ({ rank: index + 1, teamId: index + 1, name: `Tým ${index + 1}`, logoUrl: "", score: 9 - index, sampleSize: 6, lowConfidence: false }))]))])) as LeagueStyleSnapshot["rankings"],
};

describe("GET /api/standings/style", () => {
  beforeEach(() => getLeagueStyleSnapshot.mockReset());
  it("vrací pouze veřejné Top 5", async () => {
    getLeagueStyleSnapshot.mockResolvedValue(snapshot);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/standings/style?league=39"));
    const body = await response.json();
    expect(body.full).toBe(false);
    expect(body.snapshot.rankings.TOTAL.possession).toHaveLength(5);
  });
  it("nevyvolává obnovu při chybějícím snapshotu", async () => {
    getLeagueStyleSnapshot.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/standings/style?league=39"));
    expect((await response.json()).snapshot).toBeNull();
    expect(getLeagueStyleSnapshot).toHaveBeenCalledOnce();
  });
});
