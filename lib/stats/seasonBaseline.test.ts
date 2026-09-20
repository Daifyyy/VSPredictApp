import { describe, expect, it } from "vitest";
import { stabilizedSeasonBaseline } from "./seasonBaseline";
describe("season goal baseline", () => {
  const previous = { matches: 306, homeGoals: 551, awayGoals: 421 };
  it("stabilizes Eredivisie without forcing a home advantage", () => {
    const r = stabilizedSeasonBaseline({ matches: 56, homeGoals: 96, awayGoals: 122 }, previous)!;
    expect(r.currentWeight).toBeCloseTo(56 / 156);
    expect(r.home + r.away).toBeCloseTo(3.433635, 4);
    expect(r.away).toBeLessThan(2.18);
  });
  it("changes smoothly across the old 20-match boundary", () => {
    const before = stabilizedSeasonBaseline({ matches: 19, homeGoals: 30, awayGoals: 40 }, previous)!;
    const after = stabilizedSeasonBaseline({ matches: 20, homeGoals: 31, awayGoals: 41 }, previous)!;
    expect(Math.abs(after.away - before.away)).toBeLessThan(.02);
  });
  it("handles empty or malformed history and caps prior by available matches", () => {
    expect(stabilizedSeasonBaseline(null, null)).toBeNull();
    expect(stabilizedSeasonBaseline({ matches: 2, homeGoals: 2, awayGoals: 1 }, null)).toBeNull();
    expect(stabilizedSeasonBaseline(null, previous)?.fallback).toBe("PREVIOUS_ONLY");
    expect(stabilizedSeasonBaseline({ matches: 20, homeGoals: 30, awayGoals: 20 }, null)?.fallback).toBe("CURRENT_ONLY");
    expect(stabilizedSeasonBaseline(null, { matches: 10, homeGoals: 15, awayGoals: 10 })?.priorMatches).toBe(10);
  });
});
