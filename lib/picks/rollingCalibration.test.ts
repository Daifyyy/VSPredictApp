import { describe, expect, it } from "vitest";
import { rollingBinaryCalibration, rollingFolds } from "./rollingCalibration";

describe("rolling calibration", () => {
  it("never splits fixtures sharing the same kickoff", () => {
    const rows = Array.from({ length: 180 }, (_, index) => ({ index, kickoff: new Date(2026, 0, Math.floor(index / 2) + 1) }));
    const folds = rollingFolds(rows, (row) => row.kickoff, { minimumTraining: 100, holdoutSize: 30 });
    expect(folds.length).toBeGreaterThan(0);
    for (const fold of folds) expect(fold.trainingTo.getTime()).toBeLessThan(fold.holdoutFrom.getTime());
  });

  it("rejects a calibration that does not improve future observations", () => {
    const points = Array.from({ length: 260 }, (_, index) => ({ probability: .6, outcome: index % 5 < 3, kickoff: new Date(2025, 0, index + 1) }));
    const report = rollingBinaryCalibration(points);
    expect(report.calibrated.n).toBeGreaterThanOrEqual(100);
    expect(report.accepted).toBe(false);
  });
});
