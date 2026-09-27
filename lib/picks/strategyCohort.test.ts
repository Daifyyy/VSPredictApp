import { describe, expect, it } from "vitest";
import { strategyCohort, ledgerClv } from "./strategyCohort";

describe("shared strategy cohort and execution CLV", () => {
  it("separates v5, current main, context and count versions", () => {
    expect(strategyCohort("PRESSURE_FLOW_V5")).toMatchObject({ modelVersion: 5, modelContext: "LEAGUE", contextVersion: 1 });
    expect(strategyCohort("OVER_25", "EURO_CUP")).toMatchObject({ modelVersion: 7, contextVersion: 2 });
    expect(strategyCohort("FOULS").countModelVersion).toBe(1);
    expect(strategyCohort("CORNERS").countModelVersion).toBe(2);
  });
  it("uses taken odds, preserves audit fields and excludes bookmaker switches", () => {
    const row = { decimalOdds: 2, closingBenchmarkProbability: .55, bookmaker: "A", openingBookmaker: "B", sameBookClv: true, probabilityClv: .02, closingFreshness: "PRIMARY_30", closingBenchmarkQuality: "PANEL", clvMethodVersion: 2 };
    expect(ledgerClv(row).priceClv).toBeCloseTo(.1);
    expect(ledgerClv(row).sameBookClv).toBe(false);
    expect(ledgerClv({ ...row, openingBookmaker: "A" }).sameBookClv).toBe(true);
    expect(ledgerClv({ ...row, clvMethodVersion: 1 }).priceClv).toBeNull();
    expect(ledgerClv({ ...row, closingBenchmarkProbability: null }).priceClv).toBeNull();
  });
});
