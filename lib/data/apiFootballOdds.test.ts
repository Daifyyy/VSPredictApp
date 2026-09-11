import { describe, expect, it } from "vitest";
import { bookOddsOf } from "./apiFootball";

describe("combined result and total odds", () => {
  it("keeps direct winner + goals quotes from the existing odds response", () => {
    const parsed = bookOddsOf({
      id: 8,
      name: "Test book",
      bets: [{
        id: 99,
        name: "Match Result and Total Goals",
        values: [
          { value: "Home / Over 1.5", odd: "2.35" },
          { value: "Away & Under 4.5", odd: "4.10" },
          { value: "Draw / Over 1.5", odd: "3.20" },
        ],
      }],
    });
    expect(parsed.resultTotals).toEqual([
      { winner: "home", total: "over", line: 1.5, odds: 2.35 },
      { winner: "away", total: "under", line: 4.5, odds: 4.1 },
    ]);
  });

  it("accepts the Home/Away and Over/Under provider market name", () => {
    const parsed = bookOddsOf({ id: 8, name: "Test book", bets: [{ id: 100, name: "Home/Away and Over/Under", values: [{ value: "Away / Over 1.5", odd: "3.60" }] }] });
    expect(parsed.resultTotals).toEqual([{ winner: "away", total: "over", line: 1.5, odds: 3.6 }]);
  });
});
