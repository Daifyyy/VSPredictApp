import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: {
  autonomousTipSnapshot: {findMany: async () => [{id:"old-btts",fixtureId:1,strategy:"BTTS_YES",policyVersion:2,modelVersion:7,modelContext:"LEAGUE",contextVersion:1}]},
  modelStrategyDefinition: {findMany: async () => []},
  dataIncident: {findMany: async () => []},
  fixturePrediction: {findMany: async () => []},
  apiCache: {findMany: async () => []},
} }));
import { loadDailyAutonomousSources } from "./dailySelectionSources";
afterEach(() => vi.unstubAllEnvs());
it("rejects stored paused candidates before qualifying a new daily selection", async () => {
  vi.stubEnv("STRATEGY_FOCUS_MODE_ENABLED", "true");
  const result = await loadDailyAutonomousSources("2026-10-18");
  expect(result.candidates).toEqual([]);
  expect(result.rejected).toEqual([{id:"AUTONOMOUS:old-btts",reason:"STRATEGY_COLLECTION_PAUSED"}]);
});
