import { afterEach, describe, expect, it, vi } from "vitest";
import { pressureShadowMode, pressureV5CollectionEnabled, pressureV5OpportunitiesEnabled } from "./pressureCollectionPolicy";
afterEach(() => vi.unstubAllEnvs());
describe("pressure research pause", () => {
  it("keeps the existing default and legacy fallback", () => {
    vi.stubEnv("PRESSURE_SHADOW_COLLECTION_ENABLED", "true");
    vi.stubEnv("PRESSURE_V5_ENABLED", "true");
    expect(pressureShadowMode(true, true)).toBe("V5");
    expect(pressureShadowMode(true, false)).toBe("LEGACY");
    vi.stubEnv("PRESSURE_V5_ENABLED", "false");
    expect(pressureShadowMode(true, true)).toBe("LEGACY");
  });
  it("master pause cannot fall back to an older model or create new research opportunities", () => {
    vi.stubEnv("PRESSURE_SHADOW_COLLECTION_ENABLED", "false");
    vi.stubEnv("PRESSURE_V5_ENABLED", "true");
    vi.stubEnv("PRESSURE_V5_OPPORTUNITIES_ENABLED", "true");
    expect(pressureShadowMode(true, true)).toBe("NONE");
    expect(pressureShadowMode(true, false)).toBe("NONE");
    expect(pressureV5CollectionEnabled()).toBe(false);
    expect(pressureV5OpportunitiesEnabled()).toBe(false);
  });
  it("resource denial takes precedence over all version flags", () => {
    vi.stubEnv("PRESSURE_SHADOW_COLLECTION_ENABLED", "true");
    vi.stubEnv("PRESSURE_V5_ENABLED", "true");
    expect(pressureShadowMode(false, true)).toBe("NONE");
  });
});
