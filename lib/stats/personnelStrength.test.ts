import { describe, expect, it } from "vitest";
import { playerPersonnelValue, weightedUnitStrength } from "./personnelStrength";

describe("personnel strength", () => {
  it("shrinks a small sample to the positional prior", () => {
    const row = playerPersonnelValue({ playerId: 1, position: "F", appearances: 1, starts: 1, minutes: 90, rating: 9, goals: 1, assists: 0 });
    expect(row.quality).toBeLessThan(7.4);
    expect(row.quality).toBeGreaterThan(6.7);
  });

  it("does not treat an unknown player as zero quality", () => {
    const strength = weightedUnitStrength([{ playerId: 99, position: "G" }], new Map());
    expect(strength?.value).toBeGreaterThan(6);
    expect(strength?.coverage).toBe(0);
  });
});
