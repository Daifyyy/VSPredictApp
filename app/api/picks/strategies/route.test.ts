import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllEnvs());

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getEntitlement: vi.fn(),
  strategyHubData: vi.fn(),
  strategyHubDailySummary: vi.fn(),
  allowRequest: vi.fn(() => true),
}));

vi.mock("@/lib/authUser", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/entitlements", () => ({ getEntitlement: mocks.getEntitlement }));
vi.mock("@/lib/competitionGrouping", () => ({ localDateKey: () => "2026-09-12" }));
vi.mock("@/lib/data/strategyHubStore", () => ({ strategyHubData: mocks.strategyHubData, strategyHubDailySummary: mocks.strategyHubDailySummary }));
vi.mock("@/lib/logError", () => ({ logError: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ allowRequest: mocks.allowRequest, clientKey: () => "test", tooMany: () => new Response(null, { status: 429 }) }));

import { GET } from "./route";

describe("GET /api/picks/strategies", () => {
  it("labels paused collection without hiding history or exposing protected picks", async () => {
    vi.stubEnv("STRATEGY_FOCUS_MODE_ENABLED", "true");
    const response = await GET(new Request("http://localhost/api/picks/strategies?strategy=CORNERS"));
    const body = await response.json();
    expect(body.catalog.find((item: {id: string}) => item.id === "CORNERS").statusLabel).toBe("Pozastavený sběr");
    expect(body.catalog.find((item: {id: string}) => item.id === "VALUE").statusLabel).toBe("Experiment");
    expect(body.locked).toBe(true);
    expect(body.data).toBeUndefined();
    expect(mocks.strategyHubData).not.toHaveBeenCalled();
  });
  it("keeps research protected and exposes only public cohort metadata", async () => {
    const response = await GET(new Request("http://localhost/api/picks/strategies?strategy=OVER_25&cohort=original"));
    const body = await response.json();
    expect(body.locked).toBe(true);
    expect(body.cohort.strategy).toBe("OVER_25_LEGACY_SHADOW");
    expect(body.data).toBeUndefined();
    expect(mocks.strategyHubData).not.toHaveBeenCalled();
  });
  it("passes an explicit original cohort to the store only for PRO", async () => {
    mocks.getEntitlement.mockReturnValue({ pro: true });
    mocks.strategyHubData.mockResolvedValue({ opportunities: [], tickets: [] });
    const response = await GET(new Request("http://localhost/api/picks/strategies?strategy=OVER_25&cohort=original"));
    expect(response.status).toBe(200);
    expect(mocks.strategyHubData).toHaveBeenCalledWith("OVER_25", "2026-09-12", "original");
  });
  it.each(["strategy=VALUE&cohort=original", "strategy=OVER_25&cohort=other", "strategy=OVER_25&cohort=original&summary=1"])("rejects invalid cohort requests: %s", async query => {
    const response = await GET(new Request(`http://localhost/api/picks/strategies?${query}`));
    expect(response.status).toBe(400);
    expect(mocks.strategyHubData).not.toHaveBeenCalled();
    expect(mocks.strategyHubDailySummary).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowRequest.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getEntitlement.mockReturnValue({ pro: false });
  });

  it("never returns concrete opportunities to a non-PRO user", async () => {
    const response = await GET(new Request("http://localhost/api/picks/strategies?strategy=VALUE&date=2026-09-12"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.locked).toBe(true);
    expect(body.data).toBeUndefined();
    expect(mocks.strategyHubData).not.toHaveBeenCalled();
  });

  it("rejects dates outside yesterday through seven days ahead", async () => {
    const response = await GET(new Request("http://localhost/api/picks/strategies?strategy=VALUE&date=2026-09-20"));
    expect(response.status).toBe(400);
  });

  it("returns the selected strategy data to PRO", async () => {
    mocks.getEntitlement.mockReturnValue({ pro: true });
    mocks.strategyHubData.mockResolvedValue({ opportunities: [], tickets: [], emptyReason: "NOT_ENOUGH_VALUE_LEGS" });
    const response = await GET(new Request("http://localhost/api/picks/strategies?strategy=VALUE&date=2026-09-12"));
    const body = await response.json();
    expect(body.locked).toBe(false);
    expect(body.data.emptyReason).toBe("NOT_ENOUGH_VALUE_LEGS");
    expect(mocks.strategyHubData).toHaveBeenCalledWith("VALUE", "2026-09-12");
  });
});
