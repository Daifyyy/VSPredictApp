import { describe, expect, it } from "vitest";
import { frozenPerformancePressure } from "./predictionStore";

describe("frozenPerformancePressure", () => {
  const v1 = { version: 1 };
  const v2 = { version: 2 };

  it("upgrades v1 to v2 only before kickoff", () => {
    expect(frozenPerformancePressure(v1, v2, true)).toBe(v2);
  });
  it("never overwrites the first v2 snapshot", () => {
    expect(frozenPerformancePressure(v2, { version: 2 }, true)).toBe(v2);
  });
  it("does not upgrade started or settled fixtures", () => {
    expect(frozenPerformancePressure(v1, v2, false)).toBe(v1);
  });
  it("stores the first available snapshot", () => {
    expect(frozenPerformancePressure(null, v2, false)).toBe(v2);
  });
});
