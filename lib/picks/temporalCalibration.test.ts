import { describe, expect, it } from "vitest";
import { applyLogistic, temporalCalibrationReport } from "./temporalCalibration";

describe("temporal calibration", () => {
  it("dělí data chronologicky a nepropouští holdout do fitu", () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ probability: index < 70 ? .8 : .2, outcome: index % 2 === 0, kickoff: new Date(2025, 0, index + 1) }));
    const report = temporalCalibrationReport(points);
    expect(report.training).toBe(70);
    expect(report.holdout).toBe(30);
    expect(report.gates.noTemporalLeakage).toBe(true);
    expect(report.dataset.trainingTo! < report.dataset.holdoutFrom!).toBe(true);
  });
  it("logistická transformace zůstává pravděpodobností", () => {
    expect(applyLogistic(.6, { a: .7, b: -.1 })).toBeGreaterThan(0);
    expect(applyLogistic(.6, { a: .7, b: -.1 })).toBeLessThan(1);
  });
});
