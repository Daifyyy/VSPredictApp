import { describe, expect, it } from "vitest";
import { frozenPerformancePressure } from "./predictionStore";

describe("frozenPerformancePressure", () => {
  const v1 = { version: 1 };
  const v2 = { version: 2 };
  const v3 = { version: 3 };

  it("upgrades v1 to v2 only before kickoff", () => {
    expect(frozenPerformancePressure(v1, v2, true)).toBe(v2);
  });
  it("never overwrites the first v2 snapshot", () => {
    expect(frozenPerformancePressure(v2, { version: 2 }, true)).toBe(v2);
  });
  it("upgrades v2 to v3 only before kickoff and then freezes v3", () => {
    expect(frozenPerformancePressure(v2, v3, true)).toBe(v3);
    expect(frozenPerformancePressure(v3, { version: 3 }, true)).toBe(v3);
    expect(frozenPerformancePressure(v2, v3, false)).toBe(v2);
  });
  it("does not upgrade started or settled fixtures", () => {
    expect(frozenPerformancePressure(v1, v2, false)).toBe(v1);
  });
  it("stores the first available snapshot", () => {
    expect(frozenPerformancePressure(null, v2, false)).toBe(v2);
  });
});
