import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tips: vi.fn(), cache: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  apiCache: { findUnique: mocks.cache, upsert: mocks.upsert },
  autonomousTipSnapshot: { findMany: mocks.tips },
  intuitionTicket: { findMany: async () => [] },
  marketSignalSnapshot: { findMany: async () => [] },
} }));
vi.mock("./pressureDailyProjection", () => ({ loadPressureDailyProjection: async () => [] }));
vi.mock("@/lib/data/intuitionTicketStore", () => ({ previewIntuitionTickets: async () => ({
  strategies: ["VALUE", "ELO_INTUITION"].map(strategy => ({ strategy, tickets: [], coverage: { candidates: 0, withOdds: 0 }, emptyReason: "EMPTY" })),
}) }));
import { refreshStrategyHubMetrics, strategyMetricsKey } from "./strategyHubStore";

describe("optional cohort refresh budget", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.tips.mockResolvedValue([]); mocks.cache.mockResolvedValue(null); mocks.upsert.mockResolvedValue({}); });
  afterEach(() => vi.restoreAllMocks());

  it("pins archive identity and stores separate small reports", async () => {
    await refreshStrategyHubMetrics(new Date("2026-10-18T10:00:00Z"));
    const filters = mocks.tips.mock.calls.map(([args]) => args.where);
    expect(filters).toContainEqual(expect.objectContaining({ strategy: "OVER_25", policyVersion: 1, modelVersion: 7, modelContext: "LEAGUE", contextVersion: 1, countModelVersion: null }));
    expect(filters).toContainEqual(expect.objectContaining({ strategy: "OVER_25_LEGACY_SHADOW", policyVersion: 1 }));
    for (const variant of ["current", "original", "archive"] as const) {
      expect(mocks.upsert.mock.calls.some(([args]) => args.where.key === strategyMetricsKey("OVER_25", variant))).toBe(true);
    }
    expect(mocks.upsert.mock.calls.every(([args]) => Buffer.byteLength(JSON.stringify(args.update.payload)) < 250_000)).toBe(true);
  });
  it("does not scan optional cohorts again within 24 hours", async () => {
    mocks.cache.mockResolvedValue({ payload: { metrics: {}, asOf: "2026-10-18T09:00:00Z" } });
    await refreshStrategyHubMetrics(new Date("2026-10-18T10:00:00Z"));
    expect(mocks.tips.mock.calls.some(([args]) => args.where.strategy === "OVER_25")).toBe(false);
    expect(mocks.tips.mock.calls.some(([args]) => args.where.strategy === "OVER_25_LEGACY_SHADOW")).toBe(true);
  });
  it("defers optional work after the normal refresh used its time allowance", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(21_000);
    await refreshStrategyHubMetrics(new Date("2026-10-18T10:00:00Z"));
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.tips.mock.calls.some(([args]) => args.where.strategy === "OVER_25")).toBe(false);
    expect(mocks.tips.mock.calls.some(([args]) => args.where.strategy === "OVER_25_LEGACY_SHADOW")).toBe(true);
  });
});
