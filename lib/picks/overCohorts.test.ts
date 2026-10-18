import { describe, expect, it } from "vitest";
import { OVER_COHORTS, isOverCohort } from "./overCohorts";
import { STRATEGY_CATALOG } from "./modelLab";
import { STRATEGY_HUB_IDS, isAllowedStrategyDate } from "./strategyHub";

describe("Over cohort registry", () => {
  it("keeps the same identities and rules in Model Lab without duplicate entries", () => {
    for (const cohort of OVER_COHORTS) {
      const matches = STRATEGY_CATALOG.filter(row => row.strategy === cohort.strategy && row.policyVersion === cohort.policyVersion);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ title: cohort.title, status: cohort.status, rules: cohort.rules });
    }
  });
  it("does not expand the default distribution catalog", () => {
    expect(STRATEGY_HUB_IDS).not.toContain("OVER_25_LEGACY_SHADOW");
    expect(isOverCohort("original")).toBe(true);
    expect(isOverCohort("arbitrary")).toBe(false);
  });
  it("rejects calendar rollover instead of accepting an impossible day", () => {
    expect(isAllowedStrategyDate("2026-02-30", "2026-03-01")).toBe(false);
  });
});
