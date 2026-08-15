import { describe, expect, it } from "vitest";
import type { ApiFixture } from "./data/apiFootball";
import { chunkFixtureIds, isInResultNotificationWindow, matchStatusEvents } from "./pushMatchStatus";

function fixture(status: string, options: {
  elapsed?: number | null;
  goals?: [number | null, number | null];
  halftime?: [number | null, number | null];
  fulltime?: [number | null, number | null];
  extratime?: [number | null, number | null];
  penalty?: [number | null, number | null];
} = {}): ApiFixture {
  const pair = (value?: [number | null, number | null]) => value
    ? { home: value[0], away: value[1] }
    : undefined;
  return {
    fixture: { id: 10, date: "2026-08-15T18:00:00Z", status: { short: status, elapsed: options.elapsed } },
    league: { id: 39, season: 2026, name: "Premier League" },
    teams: {
      home: { id: 1, name: "Arsenal", logo: "a" },
      away: { id: 2, name: "Liverpool", logo: "b" },
    },
    goals: { home: options.goals?.[0] ?? null, away: options.goals?.[1] ?? null },
    score: {
      halftime: pair(options.halftime), fulltime: pair(options.fulltime),
      extratime: pair(options.extratime), penalty: pair(options.penalty),
    },
  };
}

describe("result notification window", () => {
  const kickoff = new Date("2026-08-15T18:00:00Z");
  it("začíná po 35 minutách a končí po čtyřech hodinách", () => {
    expect(isInResultNotificationWindow(kickoff, new Date("2026-08-15T18:34:59Z"))).toBe(false);
    expect(isInResultNotificationWindow(kickoff, new Date("2026-08-15T18:35:00Z"))).toBe(true);
    expect(isInResultNotificationWindow(kickoff, new Date("2026-08-15T22:00:00Z"))).toBe(true);
    expect(isInResultNotificationWindow(kickoff, new Date("2026-08-15T22:00:01Z"))).toBe(false);
  });

  it("dávkuje unikátní ID po dvaceti", () => {
    const chunks = chunkFixtureIds([...Array.from({ length: 21 }, (_, i) => i + 1), 1]);
    expect(chunks.map((chunk) => chunk.length)).toEqual([20, 1]);
  });
});

describe("matchStatusEvents", () => {
  it("vytvoří poločas v HT i krátce po začátku druhé půle", () => {
    expect(matchStatusEvents(fixture("HT", { halftime: [1, 0] }))[0]).toMatchObject({ type: "HALFTIME", body: "Stav 1:0" });
    expect(matchStatusEvents(fixture("2H", { elapsed: 58, halftime: [1, 0] }))).toHaveLength(1);
    expect(matchStatusEvents(fixture("2H", { elapsed: 61, halftime: [1, 0] }))).toEqual([]);
  });

  it("vytvoří běžný konečný výsledek", () => {
    expect(matchStatusEvents(fixture("FT", { goals: [2, 1], halftime: [1, 0] }))).toEqual([
      expect.objectContaining({ type: "FINAL", body: "Konečný stav 2:1" }),
    ]);
  });

  it("popíše prodloužení a penalty", () => {
    expect(matchStatusEvents(fixture("AET", { goals: [2, 1], fulltime: [1, 1] }))[0].body)
      .toBe("1:1 po 90 minutách · 2:1 po prodloužení");
    expect(matchStatusEvents(fixture("PEN", { goals: [1, 1], extratime: [1, 1], penalty: [4, 5] }))[0].body)
      .toBe("1:1 po 120 minutách · penalty 4:5 · postupuje Liverpool");
  });

  it("ignoruje neukončené, zrušené a neúplné výsledky", () => {
    expect(matchStatusEvents(fixture("PST", { goals: [1, 0] }))).toEqual([]);
    expect(matchStatusEvents(fixture("CANC", { goals: [1, 0] }))).toEqual([]);
    expect(matchStatusEvents(fixture("PEN", { goals: [1, 1] }))).toEqual([]);
  });
});
