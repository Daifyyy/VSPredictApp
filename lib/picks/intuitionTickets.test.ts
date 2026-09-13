import { describe, expect, it } from "vitest";
import { buildEloIntuitionTickets, buildIntuitionTickets, isTicketLockable, rankEloCandidates, rankEloDivergences, rankIntuitionCandidates, type IntuitionSource } from "./intuitionTickets";

const books = (home: number, away: number) => [{ id: 4, name: "Test", home, draw: 3.5, away, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9,
  resultTotals: [{ winner: "home", total: "over", line: 1.5, odds: home * 1.3 }, { winner: "away", total: "over", line: 1.5, odds: away * 1.3 }] }];
function row(id: number, date: string, homeWin: number, homeOdds: number): IntuitionSource {
  return { fixtureId: id, leagueId: 39, kickoff: new Date(`${date}T14:00:00Z`), homeName: `H${id}`, awayName: `A${id}`, homeWin, awayWin: .2, lambdaHome: 2.4, lambdaAway: .6, lowConfidence: false, readinessSample: 8, oddsBooks: books(homeOdds, 4.5) };
}
function contextual(source: IntuitionSource, homeScore = .8) {
  const signal = { formPpg: 2, seasonPpg: 2, standingRank: 2, standingSize: 20, restDays: 6, importantAbsences: 0, strengthLoss: 0, missingGoalkeeper: false, missingKeyScorer: false, coachChangedRecently: false, lineupAvailable: true };
  source.context = { home: signal, away: { ...signal, formPpg: 1, seasonPpg: 1.2, standingRank: 10 } };
  source.pedigree = { home: { score: homeScore, eloPercentile: .9, continuity: 1, europeanExperience: .5, seasons: 4, leagueMatches: 120, europeanMatches: 10, established: homeScore >= .6 }, away: { score: .3, eloPercentile: .4, continuity: .5, europeanExperience: 0, seasons: 2, leagueMatches: 60, europeanMatches: 0, established: false } };
  return source;
}

describe("intuition tickets", () => {
  it("recognises a priced value anchor", () => {
    expect(rankIntuitionCandidates([row(1, "2026-09-12", .43, 3.4)])[0]).toMatchObject({ fixtureId: 1, role: "VALUE", total: "OVER", line: 1.5 });
  });

  it("accepts a favourite below 2.50 when the combined selection has value", () => {
    const candidate = rankIntuitionCandidates([row(9, "2026-09-12", .72, 1.8)])[0];
    expect(candidate).toMatchObject({ fixtureId: 9, winner: "HOME", role: "VALUE" });
    expect(candidate.modelExpectedValue).toBeGreaterThanOrEqual(.08);
  });

  it("ranks a more probable quality-team combination above a larger-EV outsider", () => {
    const outsider = contextual(row(81, "2026-09-12", .43, 3.4), .3);
    const qualityFavourite = contextual(row(82, "2026-09-12", .67, 1.8), .85);
    const ranked = rankIntuitionCandidates([outsider, qualityFavourite]);
    expect(ranked[0]?.fixtureId).toBe(82);
    expect(ranked.find((item) => item.fixtureId === 81)?.modelExpectedValue).toBeGreaterThan(ranked[0].modelExpectedValue!);
  });

  it("estimates a correlated synthetic quote from separate winner and total prices", () => {
    const source = row(7, "2026-09-12", .62, 1.9);
    source.oddsBooks = [{ id: 4, name: "Test", home: 1.9, draw: 3.5, away: 4.5, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9, matchTotals: [{ line: 1.5, over: 2.5, under: 1.5 }, { line: 4.5, over: 5, under: 1.18 }] }];
    expect(rankIntuitionCandidates([source])[0]).toMatchObject({ fixtureId: 7, priceKind: "SYNTHETIC" });
  });

  it("rejects a short combined price with negative model EV", () => {
    const source = row(8, "2026-09-12", .8, 1.23);
    source.oddsBooks = [{ id: 4, name: "Test", home: 1.23, draw: 6, away: 12, over25: 1.4, under25: 3.1, btts: 1.9, bttsNo: 1.9,
      resultTotals: [{ winner: "home", total: "over", line: 1.5, odds: 1.37 }] }];
    expect(rankIntuitionCandidates([source])).toEqual([]);
  });

  it("rejects VALUE when form and season performance create a serious context veto", () => {
    const source = contextual(row(10, "2026-09-12", .62, 1.8), .8);
    source.context = {
      home: { ...source.context!.home, formPpg: .4, seasonPpg: .7 },
      away: { ...source.context!.away, formPpg: 1.8, seasonPpg: 1.6 },
    };
    expect(rankIntuitionCandidates([source])).toEqual([]);
  });

  it("builds two disjoint tickets only from at least six fixtures", () => {
    const rows = [row(1, "2026-09-12", .62, 1.8), row(2, "2026-09-12", .61, 1.85), ...[3,4,5,6].map((id) => row(id, "2026-09-12", .62, 1.8))];
    const tickets = buildIntuitionTickets(rows, "2026-09-12");
    expect(tickets).toHaveLength(2);
    expect(tickets.every((ticket) => ticket.legs.length === 3)).toBe(true);
    expect(new Set(tickets.flatMap((ticket) => ticket.legs.map((leg) => leg.fixtureId))).size).toBe(6);
  });

  it("allows one expensive value exception but never builds a ticket from several speculative legs", () => {
    const expensive = [1, 2, 3].map((id) => row(id, "2026-09-12", .43, 3.4));
    const weakerCheap = [4, 5, 6].map((id) => row(id, "2026-09-12", .62, 1.8));
    for (const item of expensive) item.lambdaHome = 3;
    const tickets = buildIntuitionTickets([...expensive, ...weakerCheap], "2026-09-12");
    expect(tickets).toHaveLength(1);
    expect(tickets[0].legs.filter((leg) => leg.decimalOdds! > 3.25 || leg.marketWinnerProbability! < .38)).toHaveLength(1);
    expect(buildIntuitionTickets(expensive, "2026-09-12")).toEqual([]);
  });

  it("does not create a ticket from only two qualified legs", () => {
    expect(buildIntuitionTickets([row(71, "2026-09-12", .43, 3.4), row(72, "2026-09-12", .43, 3.4)], "2026-09-12")).toEqual([]);
  });

  it("never locks a ticket at or after its first kickoff", () => {
    const at = new Date("2026-09-12T10:21:00Z");
    expect(isTicketLockable(new Date("2026-09-12T10:15:00Z"), at)).toBe(false);
    expect(isTicketLockable(new Date("2026-09-12T10:21:00Z"), at)).toBe(false);
    expect(isTicketLockable(new Date("2026-09-12T11:00:00Z"), at)).toBe(true);
  });

  it("extends to the next day only when the first day has fewer than three candidates", () => {
    const tickets = buildIntuitionTickets([row(1, "2026-09-12", .43, 3.4), row(2, "2026-09-12", .62, 1.8), row(3, "2026-09-13", .6, 1.9)], "2026-09-12");
    expect(tickets[0]?.dateKeys).toEqual(["2026-09-12", "2026-09-13"]);
  });

  it("accepts a Monaco-type direct candidate in ELO even when the main-model EV is negative", () => {
    const source = row(20, "2026-09-12", .18, 3.4);
    source.lambdaHome = .45; source.lambdaAway = 1.5;
    source.oddsBooks = [{ id: 4, name: "Test", home: 3.4, draw: 3.5, away: 4.5, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9,
      resultTotals: [{ winner: "home", total: "under", line: 5.5, odds: 4.42 }] }];
    source.elo = { homeLongRating: 1580, awayLongRating: 1510, homeFastRating: 1570, awayFastRating: 1515, homeLongSample: 20, awayLongSample: 20, homeFastSample: 12, awayFastSample: 12, homeProbability: .43, awayProbability: .20, longHomeProb: .44, longAwayProb: .20, fastHomeProb: .42, fastAwayProb: .20 };
    contextual(source);
    const candidate = rankEloCandidates([source])[0];
    expect(candidate).toMatchObject({ fixtureId: 20, winner: "HOME", role: "ELO", priceKind: "DIRECT" });
    expect(candidate.modelExpectedValue).toBeLessThan(0);
  });

  it("rejects a cosmetic goal condition that does not improve the winner bet", () => {
    const source = contextual(row(21, "2026-09-12", .44, 3.5));
    source.oddsBooks = [{ id: 4, name: "Test", home: 3.5, draw: 3.5, away: 2.2, over25: 1.9, under25: 1.9, btts: 1.9, bttsNo: 1.9,
      resultTotals: [{ winner: "home", total: "under", line: 5.5, odds: 3.48 }] }];
    expect(rankIntuitionCandidates([source])).toEqual([]);
    source.elo = { homeLongRating: 1580, awayLongRating: 1510, homeFastRating: 1570, awayFastRating: 1515, homeLongSample: 20, awayLongSample: 20, homeFastSample: 12, awayFastSample: 12, homeProbability: .43, awayProbability: .2, longHomeProb: .44, longAwayProb: .2, fastHomeProb: .42, fastAwayProb: .2 };
    expect(rankEloCandidates([source])).toEqual([]);
  });

  it("ELO odmítá syntetickou cenu a drží unikátní fixtures mezi A/B", () => {
    const rows = Array.from({ length: 7 }, (_, index) => { const source = row(30 + index, "2026-09-12", .2, 2.2); source.oddsBooks = books(2.2, 4.5); source.elo = { homeLongRating: 1660, awayLongRating: 1500, homeFastRating: 1640, awayFastRating: 1500, homeLongSample: 20, awayLongSample: 20, homeFastSample: 10, awayFastSample: 10, homeProbability: .56, awayProbability: .20, longHomeProb: .57, longAwayProb: .19, fastHomeProb: .55, fastAwayProb: .21 }; return contextual(source); });
    rows[0].oddsBooks = [{ id: 4, name: "Test", home: 3.4, draw: 3.5, away: 4.5, matchTotals: [{ line: 1.5, over: 1.5, under: 4.2 }] }];
    expect(rankEloCandidates([rows[0]])).toEqual([]);
    const tickets = buildEloIntuitionTickets(rows.slice(1), "2026-09-12");
    expect(tickets.every((ticket) => ticket.legs.length === 3 && ticket.odds! > 0)).toBe(true);
    expect(tickets.every((ticket) => ticket.legs.filter((leg) => leg.decimalOdds! > 3.25 || leg.marketWinnerProbability! < .38).length <= 1)).toBe(true);
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
  it("keeps Championship ELO signals in shadow tracking and out of tickets", () => {
    const source = row(40, "2026-09-12", .42, 3.4);
    source.leagueId = 40;
    source.elo = { homeLongRating: 1600, awayLongRating: 1500, homeFastRating: 1590, awayFastRating: 1500, homeLongSample: 20, awayLongSample: 20, homeFastSample: 10, awayFastSample: 10, homeProbability: .46, awayProbability: .28, longHomeProb: .47, longAwayProb: .27, fastHomeProb: .45, fastAwayProb: .29 };
    expect(rankEloCandidates([source])).toEqual([]);
    expect(rankEloDivergences([source])).toMatchObject([{ fixtureId: 40, leagueId: 40, reason: "LEAGUE_SHADOW_ONLY" }]);
  });

  it("uses established-club history only as an ELO ranking bonus", () => {
    const established = row(51, "2026-09-12", .42, 3.4);
    const newcomer = row(52, "2026-09-12", .42, 3.4);
    const elo = { homeLongRating: 1560, awayLongRating: 1500, homeFastRating: 1550, awayFastRating: 1500, homeLongSample: 60, awayLongSample: 60, homeFastSample: 10, awayFastSample: 10, homeProbability: .46, awayProbability: .28, longHomeProb: .47, longAwayProb: .27, fastHomeProb: .45, fastAwayProb: .29 };
    established.elo = elo; contextual(established, .8);
    newcomer.elo = { ...elo, homeLongRating: 1500, homeLongSample: 30, awayLongSample: 30 }; contextual(newcomer, .6);
    const ranked = rankEloCandidates([newcomer, established]);
    expect(ranked.map((item) => item.fixtureId)).toEqual([51, 52]);
  });
});
