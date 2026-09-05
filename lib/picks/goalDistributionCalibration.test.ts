import { describe, expect, it } from "vitest";
import { goalDistributionProbabilities } from "./goalDistributionCalibration";

describe("goal distribution calibration", () => {
  it("keeps all derived markets on one coherent distribution", () => {
    const result = goalDistributionProbabilities(1.6, 1.1, { totalScale: 1, homeShareShift: 0, rho: -.03 });
    expect(result.home + result.draw + result.away).toBeCloseTo(1, 8);
    expect(result.homeLambda + result.awayLambda).toBeCloseTo(2.7, 8);
    expect(result.over25).toBeGreaterThan(0);
    expect(result.over25).toBeLessThan(1);
    expect(result.btts).toBeGreaterThan(0);
    expect(result.btts).toBeLessThan(1);
  });

  it("total scaling changes the total without changing the home share", () => {
    const result = goalDistributionProbabilities(1.8, .9, { totalScale: 1.1, homeShareShift: 0, rho: -.03 });
    expect(result.homeLambda + result.awayLambda).toBeCloseTo(2.97, 8);
    expect(result.homeLambda / result.awayLambda).toBeCloseTo(2, 8);
  });
});
