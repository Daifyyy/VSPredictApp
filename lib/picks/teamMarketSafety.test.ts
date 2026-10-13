import { describe, it, expect } from "vitest";
import { bookOddsOf, teamTotalSide } from "@/lib/data/apiFootball";
import { parseBooks, bestLinePrice } from "./books";
import { coherentTeamLines } from "./teamMarketSafety";

const market = (name = "Total - Home", id = 16, odds = "1.70") => ({
  id, name, values: [{ value: "Over 0.5", odd: odds }, { value: "Under 0.5", odd: "2.10" }],
});
const parse = (bets: ReturnType<typeof market>[]) => bookOddsOf({ id: 4, name: "Pinnacle", bets });

describe("team market quarantine and parser identity", () => {
  it.each(["Total - Home 1st Half", "Total - Away 2nd Half", "Home Total Goals (Extra Time)", "Home Total Goals and Winner", "Asian Total - Home"])("rejects ambiguous period/market %s", name => {
    expect(teamTotalSide({ name })).toBeNull();
  });
  it("does not merge halftime into fulltime in either input order", () => {
    const full = market(), half = market("Total - Home 1st Half", 99, "3.20");
    for (const bets of [[full, half], [half, full]]) {
      const b = parse(bets);
      expect(b.totalHome).toEqual([{ line: .5, over: 1.7, under: 2.1 }]);
      expect(b.teamGoalSources).toEqual([{ id: 16, name: "Total - Home", side: "home", period: "FULL_TIME" }]);
      const [roundTrip] = parseBooks(JSON.parse(JSON.stringify([b])));
      expect(roundTrip.teamGoalSources).toEqual(b.teamGoalSources);
      expect(bestLinePrice([roundTrip], "totalHome", .5, "over")).toBeNull();
    }
  });
  it("rejects two provider identities and conflicting duplicate side prices", () => {
    expect(parse([market(), market("Home Total Goals", 100)]).totalHome).toBeUndefined();
    const b = market();
    b.values.push({ value: "Over 0.5", odd: "2.40" });
    expect(parse([b]).totalHome).toBeUndefined();
  });
  it("rejects inverted over and under ladders instead of retaining the favourable price", () => {
    expect(coherentTeamLines([{ line: .5, over: 2.4, under: 2 }, { line: 1.5, over: 1.7, under: 1.5 }])).toEqual([]);
    expect(coherentTeamLines([{ line: .5, over: 1.7, under: 1.5 }, { line: 1.5, over: 2.4, under: 2 }])).toEqual([]);
    expect(coherentTeamLines([{ line: .5, over: 1.7, under: 2 }, { line: 1.5, over: 2.4, under: 1.5 }])).toHaveLength(2);
  });
});
