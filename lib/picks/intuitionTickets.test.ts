import { describe, expect, it } from "vitest";
import { buildIntuitionTickets, rankIntuitionCandidates, type IntuitionSource } from "./intuitionTickets";

const books = (home: number, away: number) => [{ id: 4, name: "Test", home, draw: 3.5, away, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9,
  resultTotals: [{ winner: "home", total: "over", line: 1.5, odds: home * 1.18 }, { winner: "away", total: "over", line: 1.5, odds: away * 1.18 }] }];
function row(id: number, date: string, homeWin: number, homeOdds: number): IntuitionSource {
  return { fixtureId: id, leagueId: 39, kickoff: new Date(`${date}T14:00:00Z`), homeName: `H${id}`, awayName: `A${id}`, homeWin, awayWin: .2, lambdaHome: 1.8, lambdaAway: .8, lowConfidence: false, readinessSample: 8, oddsBooks: books(homeOdds, 4.5) };
}

describe("intuition tickets", () => {
  it("recognises a priced value anchor", () => {
    expect(rankIntuitionCandidates([row(1, "2026-09-12", .43, 3.4)])[0]).toMatchObject({ fixtureId: 1, role: "VALUE", total: "OVER", line: 1.5 });
  });

  it("estimates a correlated synthetic quote from separate winner and total prices", () => {
    const source = row(7, "2026-09-12", .62, 1.8);
    source.oddsBooks = [{ id: 4, name: "Test", home: 1.8, draw: 3.5, away: 4.5, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9, matchTotals: [{ line: 1.5, over: 1.25, under: 4.2 }, { line: 4.5, over: 5, under: 1.18 }] }];
    expect(rankIntuitionCandidates([source])[0]).toMatchObject({ fixtureId: 7, priceKind: "SYNTHETIC" });
  });

  it("builds two disjoint tickets only from at least six fixtures", () => {
    const rows = [row(1, "2026-09-12", .43, 3.4), row(2, "2026-09-12", .42, 3.5), ...[3,4,5,6].map((id) => row(id, "2026-09-12", .62, 1.8))];
    const tickets = buildIntuitionTickets(rows, "2026-09-12");
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.flatMap((ticket) => ticket.legs.map((leg) => leg.fixtureId))).size).toBe(6);
  });

  it("extends to the next day only when the first day has fewer than three candidates", () => {
    const tickets = buildIntuitionTickets([row(1, "2026-09-12", .43, 3.4), row(2, "2026-09-12", .62, 1.8), row(3, "2026-09-13", .6, 1.9)], "2026-09-12");
    expect(tickets[0]?.dateKeys).toEqual(["2026-09-12", "2026-09-13"]);
  });
});
