import { describe, expect, it } from "vitest";
import { buildEloIntuitionTickets, buildIntuitionTickets, rankEloCandidates, rankEloDivergences, rankIntuitionCandidates, type IntuitionSource } from "./intuitionTickets";

const books = (home: number, away: number) => [{ id: 4, name: "Test", home, draw: 3.5, away, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9,
  resultTotals: [{ winner: "home", total: "over", line: 1.5, odds: home * 1.18 }, { winner: "away", total: "over", line: 1.5, odds: away * 1.18 }] }];
function row(id: number, date: string, homeWin: number, homeOdds: number): IntuitionSource {
  return { fixtureId: id, leagueId: 39, kickoff: new Date(`${date}T14:00:00Z`), homeName: `H${id}`, awayName: `A${id}`, homeWin, awayWin: .2, lambdaHome: 2.4, lambdaAway: .6, lowConfidence: false, readinessSample: 8, oddsBooks: books(homeOdds, 4.5) };
}

describe("intuition tickets", () => {
  it("recognises a priced value anchor", () => {
    expect(rankIntuitionCandidates([row(1, "2026-09-12", .43, 3.4)])[0]).toMatchObject({ fixtureId: 1, role: "VALUE", total: "OVER", line: 1.5 });
  });

  it("estimates a correlated synthetic quote from separate winner and total prices", () => {
    const source = row(7, "2026-09-12", .62, 1.9);
    source.oddsBooks = [{ id: 4, name: "Test", home: 1.9, draw: 3.5, away: 4.5, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9, matchTotals: [{ line: 1.5, over: 1.5, under: 4.2 }, { line: 4.5, over: 5, under: 1.18 }] }];
    expect(rankIntuitionCandidates([source])[0]).toMatchObject({ fixtureId: 7, priceKind: "SYNTHETIC" });
  });

  it("rejects a short combined price with negative model EV", () => {
    const source = row(8, "2026-09-12", .8, 1.23);
    source.oddsBooks = [{ id: 4, name: "Test", home: 1.23, draw: 6, away: 12, over25: 1.4, under25: 3.1, btts: 1.9, bttsNo: 1.9,
      resultTotals: [{ winner: "home", total: "over", line: 1.5, odds: 1.37 }] }];
    expect(rankIntuitionCandidates([source])).toEqual([]);
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

  it("accepts a Monaco-type direct candidate in ELO even when the main-model EV is negative", () => {
    const source = row(20, "2026-09-12", .18, 3.4);
    source.lambdaHome = .45; source.lambdaAway = 1.5;
    source.elo = { homeLongRating: 1580, awayLongRating: 1510, homeFastRating: 1570, awayFastRating: 1515, homeLongSample: 20, awayLongSample: 20, homeFastSample: 12, awayFastSample: 12, homeProbability: .43, awayProbability: .20, longHomeProb: .44, longAwayProb: .20, fastHomeProb: .42, fastAwayProb: .20 };
    const candidate = rankEloCandidates([source])[0];
    expect(candidate).toMatchObject({ fixtureId: 20, winner: "HOME", role: "ELO", priceKind: "DIRECT" });
    expect(candidate.modelExpectedValue).toBeLessThan(0);
  });

  it("ELO odmítá syntetickou cenu a drží unikátní fixtures mezi A/B", () => {
    const rows = Array.from({ length: 7 }, (_, index) => { const source = row(30 + index, "2026-09-12", .2, 3.4); source.elo = { homeLongRating: 1600, awayLongRating: 1500, homeFastRating: 1590, awayFastRating: 1500, homeLongSample: 20, awayLongSample: 20, homeFastSample: 10, awayFastSample: 10, homeProbability: .46, awayProbability: .28, longHomeProb: .47, longAwayProb: .27, fastHomeProb: .45, fastAwayProb: .29 }; return source; });
    rows[0].oddsBooks = [{ id: 4, name: "Test", home: 3.4, draw: 3.5, away: 4.5, matchTotals: [{ line: 1.5, over: 1.5, under: 4.2 }] }];
    expect(rankEloCandidates([rows[0]])).toEqual([]);
    const tickets = buildEloIntuitionTickets(rows.slice(1), "2026-09-12");
    expect(tickets.every((ticket) => ticket.legs.length >= 3 && ticket.legs.length <= 4 && ticket.odds! >= 8 && ticket.odds! <= 30)).toBe(true);
    expect(new Set(tickets.flatMap((ticket) => ticket.legs.map((leg) => leg.fixtureId))).size).toBe(tickets.flatMap((ticket) => ticket.legs).length);
  });

  it("Lazio-type extrém proti shodě trhu a modelu ukládá jako divergenci, ne kandidáta", () => {
    const source = row(1550121, "2026-09-12", .2721, 3.4);
    source.awayWin = .4628; source.lambdaHome = 1.0919; source.lambdaAway = 1.5012;
    source.elo = { homeLongRating: 1653.17, awayLongRating: 1657.48, homeFastRating: 1638.18, awayFastRating: 1584.63, homeLongSample: 137, awayLongSample: 139, homeFastSample: 15.2, awayFastSample: 15.3, homeProbability: .4694, awayProbability: .2864, longHomeProb: .4435, longAwayProb: .3039, fastHomeProb: .5174, fastAwayProb: .2541 };
    source.oddsBooks = books(3.4, 2.31);
    expect(rankEloCandidates([source]).some((item) => item.winner === "HOME")).toBe(false);
    expect(rankEloDivergences([source])).toMatchObject([{ fixtureId: 1550121, winner: "HOME", reason: "MARKET_AND_MODEL_OPPOSE_EXTREME_ELO" }]);
  });
});
