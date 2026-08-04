import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getLeagueStyleSnapshot = vi.fn();
vi.mock("@/lib/authUser", () => ({ getCurrentUser }));
vi.mock("@/lib/data/repository", () => ({ getLeagueStyleSnapshot }));
vi.mock("@/lib/rateLimit", () => ({ allowRequest: () => true, clientKey: () => "test", tooMany: () => new Response(null, { status: 429 }) }));

describe("GET /api/standings/style/full", () => {
  beforeEach(() => { getCurrentUser.mockReset(); getLeagueStyleSnapshot.mockReset(); });
  it("odmítne anonymního uživatele", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(new Request("http://localhost/api/standings/style/full?league=39"))).status).toBe(401);
    expect(getLeagueStyleSnapshot).not.toHaveBeenCalled();
  });
  it("odmítne FREE uživatele", async () => {
    getCurrentUser.mockResolvedValue({ id: "1", tier: "FREE", proTrialUsed: false });
    const { GET } = await import("./route");
    expect((await GET(new Request("http://localhost/api/standings/style/full?league=39"))).status).toBe(403);
  });
  it("vrátí úplný snapshot PRO uživateli", async () => {
    getCurrentUser.mockResolvedValue({ id: "1", tier: "PRO", proTrialUsed: false });
    getLeagueStyleSnapshot.mockResolvedValue({ leagueId: 39 });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/standings/style/full?league=39"));
    expect(response.status).toBe(200);
    expect((await response.json()).full).toBe(true);
  });
});
