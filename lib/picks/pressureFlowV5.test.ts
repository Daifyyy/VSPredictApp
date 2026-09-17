import { describe, expect, it } from "vitest";
import { pressureFlowCandidates } from "./pressureFlowV5";
import type { PerformancePressureShadowV5 } from "./performancePressureShadowV5";

const pressure = { featureCoverage: .9, fallbacks: [], marketProbabilities: { OVER_25: .7, BTTS_YES: .68, TEAM_HOME_05: .8, TEAM_HOME_15: .6, TEAM_AWAY_05: .72, TEAM_AWAY_15: .55 } } as unknown as PerformancePressureShadowV5;
const books = [{ id: 4, name: "Pinnacle", over25: 1.9, under25: 1.9, btts: 1.95, bttsNo: 1.85, totalHome: [{ line: .5, over: 1.7, under: 2.1 }, { line: 1.5, over: 2.1, under: 1.7 }], totalAway: [{ line: .5, over: 1.8, under: 2 }, { line: 1.5, over: 2.4, under: 1.55 }] }];

describe("pressure flow v5 policy", () => {
  it("keeps at most one opportunity from each family", () => {
    const rows = pressureFlowCandidates(pressure, books as never, new Date("2026-09-17T08:00:00Z"));
    expect(rows.filter((row) => row.market === "OVER_25")).toHaveLength(1);
    expect(rows.filter((row) => row.market === "BTTS")).toHaveLength(1);
    expect(rows.filter((row) => row.market.startsWith("TEAM_"))).toHaveLength(1);
    expect(rows.every((row) => row.eligible)).toBe(true);
  });
  it("rejects output with insufficient feature coverage", () => {
    expect(pressureFlowCandidates({ ...pressure, featureCoverage: .5 } as never, books as never, new Date())).toHaveLength(0);
  });
});
