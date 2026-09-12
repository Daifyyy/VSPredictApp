import { beforeEach, describe, expect, it, vi } from "vitest";

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
