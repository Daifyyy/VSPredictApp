import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/data/modelLabDetailStore", () => ({ readModelLabDetail: vi.fn() }));
import { readModelLabDetail } from "@/lib/data/modelLabDetailStore";
vi.mock("@/lib/db", () => ({ prisma: { modelStrategyMetricSnapshot: { findMany: vi.fn() }, modelStrategyDefinition: { findMany: vi.fn() }, apiCache: { findUnique: vi.fn() } } }));
vi.mock("@/lib/authUser", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ getEntitlement: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ allowRequest: () => true, clientKey: () => "test", tooMany: vi.fn() }));
vi.mock("@/lib/data/modelStrategyLedger", () => ({ loadModelStrategyLedger: vi.fn(), MODEL_LAB_REPORT_VERSION: 2 }));
vi.mock("@/lib/data/pressurePerformanceStore", () => ({ PRESSURE_PERFORMANCE_CACHE_KEY: "pressure-performance:v5:report:1" }));
import { prisma } from "@/lib/db";
import { getEntitlement } from "@/lib/entitlements";
import { loadModelStrategyLedger } from "@/lib/data/modelStrategyLedger";
import { GET } from "./route";

describe("model overview API", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.modelStrategyMetricSnapshot.findMany).mockResolvedValue([]);
    vi.mocked(prisma.modelStrategyDefinition.findMany).mockResolvedValue([]);
    vi.mocked(prisma.apiCache.findUnique).mockResolvedValue(null);
    vi.mocked(getEntitlement).mockReturnValue({ pro: false } as never);
  });
  it("reads a public summary without historical ledger aggregation and preserves retired policy", async () => {
    vi.mocked(prisma.modelStrategyDefinition.findMany).mockResolvedValue([{ strategy: "OVER_25", policyVersion: 1, modelVersion: 7, status: "LIVE_TEST" }] as never);
    const response = await GET(new Request("https://example.test/api/picks/model-lab?detail=false"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.cards.find((row: {strategy: string; policyVersion: number}) => row.strategy === "OVER_25" && row.policyVersion === 1).status).toBe("RETIRED");
    expect(payload.cards.find((row: {strategy: string}) => row.strategy === "PRESSURE_FLOW_V5").modelVersion).toBe(5);
    expect(payload.cards[0].awaitingRefresh).toBe(true);
    expect(payload.detailRows).toBeUndefined();
    expect(loadModelStrategyLedger).not.toHaveBeenCalled();
  });
  it("does not expose protected detail to a public request", async () => {
    vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
    expect((await GET(new Request("https://example.test/api/picks/model-lab?detail=true"))).status).toBe(403);
    expect(prisma.modelStrategyMetricSnapshot.findMany).not.toHaveBeenCalled();
    expect(loadModelStrategyLedger).not.toHaveBeenCalled();
    expect(readModelLabDetail).not.toHaveBeenCalled();
  });
  it('reads only saved detail in saving mode, with PRO auth and explicit policy', async () => {
    vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
    vi.mocked(getEntitlement).mockReturnValue({ pro: true } as never);
    vi.mocked(readModelLabDetail).mockResolvedValue({ detailRows: [], segments: [], asOf: '2026-10-01T00:00:00Z', stale: true } as never);
    const response = await GET(new Request('https://example.test/api/picks/model-lab?detail=true&strategy=OVER_25&policyVersion=1&page=2'));
    expect(response.status).toBe(200);
    expect(readModelLabDetail).toHaveBeenCalledWith('LEAGUE', 'OVER_25', 1, 2);
    expect(loadModelStrategyLedger).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ stale: true });
  });
  it('never backfills missing detail on GET', async () => {
    vi.stubEnv('RESOURCE_SAVING_READS_ENABLED', 'true');
    vi.mocked(getEntitlement).mockReturnValue({ pro: true } as never);
    vi.mocked(readModelLabDetail).mockResolvedValue(null);
    const response = await GET(new Request('https://example.test/api/picks/model-lab?detail=true&strategy=OVER_25&policyVersion=1'));
    expect(response.status).toBe(503);
    expect(loadModelStrategyLedger).not.toHaveBeenCalled();
  });
  it("restricts detail to the selected policy", async () => {
    vi.mocked(getEntitlement).mockReturnValue({ pro: true } as never);
    vi.mocked(loadModelStrategyLedger).mockResolvedValue({ ledger: [{ id: "current", policyVersion: 2 }, { id: "old", policyVersion: 1 }], byFixture: new Map() } as never);
    const response = await GET(new Request("https://example.test/api/picks/model-lab?detail=true&policyVersion=1"));
    expect((await response.json()).detailRows).toEqual([{ id: "old", policyVersion: 1 }]);
    expect(response.headers.get("cache-control")).toContain("private");
  });
});
