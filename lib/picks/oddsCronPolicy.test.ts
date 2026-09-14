import { describe, expect, it } from "vitest";
import { allowedOddsFixtures, priorityOrder } from "./oddsCronPolicy";

describe("odds cron policy", () => {
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
