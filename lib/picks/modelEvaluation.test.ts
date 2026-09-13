import { describe, expect, it } from "vitest";
import { evaluateModelRows, type ModelEvaluationRow } from "./modelEvaluation";

const row = (overrides: Partial<ModelEvaluationRow> = {}): ModelEvaluationRow => ({
  fixtureId: 1, leagueId: 39, kickoff: new Date("2026-09-01T18:00:00Z"),
  homeWin: .6, draw: .25, awayWin: .15, homeGoals: 2, awayGoals: 0,
  oddsHome: 1.8, oddsDraw: 3.6, oddsAway: 5, oddsCloseHome: 1.7, oddsCloseDraw: 3.8, oddsCloseAway: 5.5,
  ...overrides,
});

describe("model evaluation", () => {
  it("scores model and de-vigged markets on their inspectable coverage", () => {
    const result = evaluateModelRows([row(), row({ fixtureId: 2, oddsCloseHome: null })]);
    expect(result.model.n).toBe(2);
    expect(result.opening.n).toBe(2);
    expect(result.closing.n).toBe(1);
    expect(result.model.logLoss).toBeCloseTo(-Math.log(.6));
    expect(result.dataQuality.closingCoverage).toBe(.5);
  });

  it("reports and removes duplicate fixture ids", () => {
    const result = evaluateModelRows([row(), row()]);
    expect(result.sampleSize).toBe(1);
    expect(result.dataQuality.duplicateFixtureIds).toBe(1);
  });

  it("does not let incomplete market triples enter a benchmark", () => {
    const result = evaluateModelRows([row({ oddsDraw: null })]);
    expect(result.model.n).toBe(1);
    expect(result.opening.n).toBe(0);
  });
});
