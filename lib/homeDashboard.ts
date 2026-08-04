import type { FixtureDay } from "./types";

/** První den s programem; pokud je celé okno prázdné, zůstane první den. */
export function preferredProgramDayIndex(days: readonly FixtureDay[]): number {
  const nearest = days.findIndex((day) => day.fixtures.length > 0);
  return nearest >= 0 ? nearest : 0;
}
