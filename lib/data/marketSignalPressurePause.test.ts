import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ candidates: vi.fn(() => []), upsert: vi.fn(), freeze: vi.fn((): Array<{market: string}> => []) }));
vi.mock("@/lib/db", () => ({ prisma: { marketSignalSnapshot: { upsert: mocks.upsert } } }));
vi.mock("./predictionStore", () => ({ getPredictionByFixture: async () => ({ inputSnapshot: { performancePressure: { version: 5 } } }) }));
vi.mock("@/lib/picks/marketSignals", () => ({ freezeMarketSignals: mocks.freeze }));
vi.mock("@/lib/picks/pressureFlowV5", () => ({ PRESSURE_FLOW_V5_POLICY_VERSION: 501, pressureFlowCandidates: mocks.candidates }));
import { openMarketSignals } from "./marketSignalStore";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.freeze.mockReturnValue([]); });
describe("new v5 signals during pause", () => {
  it("focus mode suppresses new paused market ledgers and pressure qualification", async () => {
    vi.stubEnv("STRATEGY_FOCUS_MODE_ENABLED", "true");
    vi.stubEnv("PRESSURE_V5_OPPORTUNITIES_ENABLED", "true");
    mocks.freeze.mockReturnValue(["BTTS", "CORNERS", "CARDS", "FOULS"].map(market => ({market})));
    await openMarketSignals(1, [], new Date());
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.candidates).not.toHaveBeenCalled();
  });
  it("does not even qualify new candidates from an existing v5 snapshot", async () => {
    vi.stubEnv("PRESSURE_SHADOW_COLLECTION_ENABLED", "false");
    vi.stubEnv("PRESSURE_V5_OPPORTUNITIES_ENABLED", "true");
    await openMarketSignals(1, [], new Date());
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("keeps existing opt-in behavior when collection is allowed", async () => {
    vi.stubEnv("PRESSURE_SHADOW_COLLECTION_ENABLED", "true");
    vi.stubEnv("PRESSURE_V5_OPPORTUNITIES_ENABLED", "true");
    await openMarketSignals(1, [], new Date());
    expect(mocks.candidates).toHaveBeenCalledTimes(1);
  });
});
