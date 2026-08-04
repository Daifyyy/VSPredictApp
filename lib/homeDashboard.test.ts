import { describe, expect, it } from "vitest";
import type { FixtureDay } from "./types";
import { preferredProgramDayIndex } from "./homeDashboard";

const day = (date: string, fixtureCount: number): FixtureDay => ({
  date,
  fixtures: Array.from({ length: fixtureCount }, (_, fixtureId) => ({ fixtureId } as FixtureDay["fixtures"][number])),
  played: [],
});

describe("preferredProgramDayIndex", () => {
  it("ponechá dnešek, když má zápasy", () => {
    expect(preferredProgramDayIndex([day("2026-08-04", 2), day("2026-08-05", 1)])).toBe(0);
  });

  it("vybere nejbližší budoucí den se zápasem", () => {
    expect(preferredProgramDayIndex([day("2026-08-04", 0), day("2026-08-05", 0), day("2026-08-06", 3)])).toBe(2);
  });

  it("u celého prázdného okna bezpečně zůstane na prvním dni", () => {
    expect(preferredProgramDayIndex([day("2026-08-04", 0)])).toBe(0);
    expect(preferredProgramDayIndex([])).toBe(0);
  });
});
