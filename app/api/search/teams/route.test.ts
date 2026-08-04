import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSearchableTeams, allowRequest } = vi.hoisted(() => ({
  getSearchableTeams: vi.fn(),
  allowRequest: vi.fn(() => true),
}));

vi.mock("@/lib/data/repository", () => ({ getSearchableTeams }));
vi.mock("@/lib/logError", () => ({ logError: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({
  allowRequest,
  clientKey: () => "test",
  tooMany: () => new Response("Too many", { status: 429 }),
}));

import { GET } from "./route";

const catalog = [
  { id: 1, name: "Sparta Praha", logoUrl: "logo", leagueId: 345, leagueName: "Fortuna Liga", country: "Česko" },
  { id: 2, name: "Slavia Praha", logoUrl: "logo", leagueId: 345, leagueName: "Fortuna Liga", country: "Česko" },
];

describe("GET /api/search/teams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRequest.mockReturnValue(true);
    getSearchableTeams.mockResolvedValue(catalog);
  });

  it("krátký dotaz vrátí prázdný výsledek bez načtení katalogu", async () => {
    const response = await GET(new Request("http://localhost/api/search/teams?q=s"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [] });
    expect(getSearchableTeams).not.toHaveBeenCalled();
  });

  it("vrátí seřazené týmy a zachová leagueId", async () => {
    const response = await GET(new Request("http://localhost/api/search/teams?q=sparta"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [catalog[0]] });
  });

  it("chybu zdroje převede na 502", async () => {
    getSearchableTeams.mockRejectedValue(new Error("offline"));
    const response = await GET(new Request("http://localhost/api/search/teams?q=sparta"));
    expect(response.status).toBe(502);
  });

  it("respektuje rate limit", async () => {
    allowRequest.mockReturnValue(false);
    const response = await GET(new Request("http://localhost/api/search/teams?q=sparta"));
    expect(response.status).toBe(429);
  });
});
