import { describe, expect, it } from "vitest";
import { summarizeHeadToHead, toPredictionSnapshot, type HeadToHeadRow } from "./h2h";

const row = (values: Partial<HeadToHeadRow> & Pick<HeadToHeadRow, "teamId" | "fixtureId" | "opponentId" | "isHome">): HeadToHeadRow => ({
  context: "league", date: new Date("2026-08-01T18:00:00Z"), season: 2026,
  goalsFor: null, goalsAgainst: null, xg: null, xgAgainst: null, corners: null,
  yellowCards: null, redCards: null, opponentName: null, opponentLogo: null,
  cachedAt: new Date("2026-08-02T00:00:00Z"), ...values,
});

describe("summarizeHeadToHead", () => {
  it("deduplikuje dvě týmové řádky stejného utkání a zachová perspektivu", () => {
    const summary = summarizeHeadToHead([
      row({ teamId: 1, fixtureId: 10, opponentId: 2, isHome: true, opponentName: "Beta", goalsFor: 2, goalsAgainst: 1, xg: 1.8 }),
      row({ teamId: 2, fixtureId: 10, opponentId: 1, isHome: false, opponentName: "Alfa", goalsFor: 1, goalsAgainst: 2, xg: 0.7 }),
    ], 1, 2, new Date("2026-08-20"));
    expect(summary.sample).toBe(1);
    expect(summary.teamAWins).toBe(1);
    expect(summary.goalsA).toBe(2);
    expect(summary.meetings[0].home.name).toBe("Alfa");
    expect(summary.meetings[0].away.name).toBe("Beta");
    expect(summary.xgA).toBeCloseTo(1.8);
  });

  it("správně otočí výsledek, když je první tým hostem", () => {
    const summary = summarizeHeadToHead([
      row({ teamId: 1, fixtureId: 11, opponentId: 2, isHome: false, goalsFor: 3, goalsAgainst: 0 }),
      row({ teamId: 2, fixtureId: 11, opponentId: 1, isHome: true, goalsFor: 0, goalsAgainst: 3 }),
    ], 1, 2);
    expect(summary.teamAWins).toBe(1);
    expect(summary.goalsA).toBe(3);
    expect(summary.meetings[0].away.id).toBe(1);
  });

  it("označí malý a převážně starý vzorek", () => {
    const summary = summarizeHeadToHead([
      row({ teamId: 1, fixtureId: 12, opponentId: 2, isHome: true, date: new Date("2020-01-01") }),
    ], 1, 2, new Date("2026-08-20"));
    expect(summary.confidence).toBe("limited");
    expect(summary.olderHistory).toBe(true);
  });

  it("vytvoří point-in-time snapshot se stářím a stejným domácím prostředím", () => {
    const capturedAt = new Date("2026-08-20T12:00:00Z");
    const summary = summarizeHeadToHead([
      row({ teamId: 1, fixtureId: 20, opponentId: 2, isHome: true, date: new Date("2026-03-01"), goalsFor: 2, goalsAgainst: 0 }),
      row({ teamId: 2, fixtureId: 20, opponentId: 1, isHome: false, date: new Date("2026-03-01"), goalsFor: 0, goalsAgainst: 2 }),
      row({ teamId: 1, fixtureId: 21, opponentId: 2, isHome: false, date: new Date("2021-03-01"), goalsFor: 1, goalsAgainst: 1 }),
    ], 1, 2, capturedAt);
    const snapshot = toPredictionSnapshot(summary, 1, capturedAt);
    expect(snapshot.version).toBe(1);
    expect(snapshot.sample).toBe(2);
    expect(snapshot.recentTwoSeasonSample).toBe(1);
    expect(snapshot.sameVenueSample).toBe(1);
    expect(snapshot.goalsPerMatchA).toBe(1.5);
  });
});
