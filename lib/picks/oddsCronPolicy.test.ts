import { describe, expect, it } from "vitest";
import { allowedOddsFixtures, priorityOrder, priorityCaptureWhere, closingPrioritySets } from "./oddsCronPolicy";

describe("odds cron policy", () => {
  it("includes qualified legacy research only within the pre-kickoff horizon", () => {
    const now = new Date("2026-10-13T10:00:00Z");
    const where = priorityCaptureWhere(now, false);
    expect(where.kickoff).toEqual({ gt: now, lte: new Date("2026-10-13T11:30:00Z") });
    expect(where.OR).toContainEqual({ strategy: "OVER_25_LEGACY_SHADOW", status: "candidate" });
    expect(priorityCaptureWhere(now, true).OR).toEqual([{
      strategy: { not: "OVER_25_LEGACY_SHADOW" }, OR: [{ status: "candidate" }],
    }]);
  });
  it("keeps research behind production and tickets and deduplicates overlapping fixtures", () => {
    const rows = [
      { fixtureId: 1, strategy: "OVER_25_LEGACY_SHADOW", status: "candidate" },
      { fixtureId: 2, strategy: "OVER_25_LEGACY_SHADOW", status: "candidate" },
      { fixtureId: 2, strategy: "ONE_X_TWO", status: "candidate" },
      { fixtureId: 3, strategy: "OVER_25", status: "watch" },
    ];
    const { p0, p1 } = closingPrioritySets(rows, [4], false);
    expect([...p0]).toEqual([4, 2]);
    expect([...p1]).toEqual([1, 3]);
    expect(closingPrioritySets(rows, [4], true).p1.size).toBe(0);
    const queue = priorityOrder([1, 2, 3, 4].map(fixtureId => ({ fixtureId, kickoff: new Date(1000 * fixtureId) })), p0);
    expect(queue.slice(0, 2).map(r => r.fixtureId)).toEqual([2, 4]);
    expect(allowedOddsFixtures({ requested: 12, globalRemaining: 100, oddsRemaining: 1200 })).toBe(12);
  });
  it("reserves retry attempts under the daily hard limit", () => {
    expect(allowedOddsFixtures({ requested: 12, globalRemaining: 99, oddsRemaining: 35 })).toBe(11);
    expect(allowedOddsFixtures({ requested: 12, globalRemaining: 99, oddsRemaining: 2 })).toBe(0);
  });

  it("orders qualified P0 before P1 and then by kickoff", () => {
    const rows = [
      { fixtureId: 2, kickoff: new Date("2026-01-01T11:00:00Z") },
      { fixtureId: 1, kickoff: new Date("2026-01-01T12:00:00Z") },
      { fixtureId: 3, kickoff: new Date("2026-01-01T10:00:00Z") },
    ];
    expect(priorityOrder(rows, new Set([1, 3])).map((row) => row.fixtureId)).toEqual([3, 1, 2]);
  });
});
