import { describe, expect, it } from "vitest";
import { splitModelLabActivity } from "./modelLabActivity";

describe("splitModelLabActivity", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");

  it("řadí aktuální výběry podle nejbližšího výkopu", () => {
    const rows = [
      { id: "later", kickoff: new Date("2026-09-03T18:00:00Z"), hit: null },
      { id: "first", kickoff: new Date("2026-09-03T14:00:00Z"), hit: null },
    ];
    expect(splitModelLabActivity(rows, now).current.map((row) => row.id)).toEqual(["first", "later"]);
  });

  it("ponechá ve výsledcích jen dnešek a předchozí pražský den", () => {
    const rows = [
      { id: "today", kickoff: new Date("2026-09-03T10:00:00Z"), hit: true },
      { id: "yesterday", kickoff: new Date("2026-09-02T10:00:00Z"), hit: false },
      { id: "old", kickoff: new Date("2026-09-01T10:00:00Z"), hit: true },
    ];
    expect(splitModelLabActivity(rows, now).recent.map((row) => row.id)).toEqual(["today", "yesterday"]);
  });

  it("neoznačí starý nevyhodnocený zápas jako aktuální", () => {
    const rows = [{ id: "stale", kickoff: new Date("2026-09-02T10:00:00Z"), hit: null }];
    expect(splitModelLabActivity(rows, now).current).toHaveLength(0);
  });

  it("nevydává definitivní zápas s chybějícím skóre za živý", () => {
    const rows = [{ id: "broken", kickoff: new Date("2026-09-03T10:00:00Z"), hit: null, final: true }];
    expect(splitModelLabActivity(rows, now).current).toHaveLength(0);
  });
});
