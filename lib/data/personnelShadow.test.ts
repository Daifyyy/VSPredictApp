import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("personnel shadow normalizace", () => {
  let availabilityType: typeof import("./personnelShadow").availabilityType;
  let lineupCompleteness: typeof import("./personnelShadow").lineupCompleteness;

  beforeAll(async () => ({ availabilityType, lineupCompleteness } = await import("./personnelShadow")));

  it("rozlišuje zranění, trest a nejistou dostupnost", () => {
    expect(availabilityType("Missing Fixture", "Knee injury")).toBe("INJURY");
    expect(availabilityType("Suspended", "Red card ban")).toBe("SUSPENSION");
    expect(availabilityType("Doubtful", "Questionable")).toBe("DOUBTFUL");
    expect(availabilityType(null, "Personal reasons")).toBe("OTHER");
  });

  it("neúplnou sestavu nevydává za plně použitelnou", () => {
    const lineup = {
      team: { id: 1, name: "A" }, formation: null, coach: null,
      startXI: Array.from({ length: 8 }, (_, id) => ({ player: { id, name: `P${id}`, number: null, pos: null, grid: null } })),
      substitutes: [],
    };
    expect(lineupCompleteness(lineup)).toBeLessThan(.8);
  });

  it("kompletní sestava s lavičkou, trenérem a formací dosáhne plné úplnosti", () => {
    const player = (id: number) => ({ player: { id, name: `P${id}`, number: id, pos: "M", grid: null } });
    expect(lineupCompleteness({
      team: { id: 1, name: "A" }, formation: "4-3-3", coach: { id: 3, name: "Coach" },
      startXI: Array.from({ length: 11 }, (_, id) => player(id)), substitutes: [player(20)],
    })).toBe(1);
  });
});
