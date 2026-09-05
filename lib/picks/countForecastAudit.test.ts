import { describe, expect, it } from "vitest";
import { countForecastAudit } from "./countForecastAudit";

describe("countForecastAudit", () => {
  it("uses only earlier observations for the holdout baseline", () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({ kickoff: new Date(2025, 0, index + 1), leagueId: 1, actual: index < 140 ? 20 : 30, predicted: 30 }));
    const report = countForecastAudit(rows);
    expect(report.dataset.training).toBe(140);
    expect(report.model.mae).toBe(0);
    expect(report.baseline.mae).toBe(10);
    expect(report.accepted).toBe(true);
  });
});
