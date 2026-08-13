import { describe, expect, it } from "vitest";
import { rankPercentile } from "./refereeStore";

describe("rankPercentile", () => {
  it("vrací krajní a střední pozici vůči soutěži", () => {
    expect(rankPercentile(2, [2, 4, 6])).toBe(0);
    expect(rankPercentile(4, [2, 4, 6])).toBe(50);
    expect(rankPercentile(6, [2, 4, 6])).toBe(100);
  });

  it("bez srovnávací skupiny nic netvrdí", () => {
    expect(rankPercentile(4, [4])).toBeNull();
  });
});
