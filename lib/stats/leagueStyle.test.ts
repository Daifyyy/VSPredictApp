import { describe, expect, it } from "vitest";
import { buildLeagueStyleSnapshot, publicLeagueStyleSnapshot } from "./leagueStyle";
import type { TeamProfileCore } from "@/lib/teamProfile";

function profile(id: number, score: number, sampleSize = 6): TeamProfileCore {
  const dimension = () => ({
    key: "possession" as const,
    label: "Kontrola míče",
    leftLabel: "Přímá hra",
    rightLabel: "Kontrola",
    score,
    available: true,
    sampleSize,
    lowConfidence: sampleSize < 4,
  });
  return {
    team: { id, name: `Tým ${id}`, logoUrl: "", country: "", entityType: "CLUB", leagueId: 39 },
    values: [], summaries: [], formQuality: [],
    styles: { TOTAL: [dimension()], HOME: [dimension()], AWAY: [dimension()] },
  };
}

function baselineProfile(id: number, score: number, sampleSize = 10): TeamProfileCore {
  return profile(id, score, sampleSize);
}

describe("league style snapshot", () => {
  it("řadí stabilně a veřejně vrací jen pět spolehlivých týmů", () => {
    const profiles = Array.from({ length: 7 }, (_, index) => profile(index + 1, index === 6 ? 10 : 9 - index, index === 6 ? 2 : 6));
    const snapshot = buildLeagueStyleSnapshot(39, 2026, profiles, "2026-08-04T00:00:00.000Z");
    expect(snapshot.rankings.TOTAL.possession[0].teamId).toBe(1);
    expect(snapshot.rankings.TOTAL.possession.at(-1)?.lowConfidence).toBe(true);
    expect(publicLeagueStyleSnapshot(snapshot).rankings.TOTAL.possession).toHaveLength(5);
  });

  it("dává aktuální sezoně hlavní váhu a transparentně ukládá oba vzorky", () => {
    const current = profile(1, 8, 2);
    const baseline = baselineProfile(1, 4, 10);
    const snapshot = buildLeagueStyleSnapshot(
      39,
      2026,
      [current],
      "2026-08-04T00:00:00.000Z",
      [baseline]
    );
    const entry = snapshot.rankings.TOTAL.possession[0];
    expect(entry).toMatchObject({
      score: 7,
      sampleSize: 12,
      currentSeasonSample: 2,
      baselineSample: 10,
      currentSeasonWeight: 0.75,
    });
  });

  it("po sedmi letošních zápasech minulou sezonu do skóre nezapočítá", () => {
    const snapshot = buildLeagueStyleSnapshot(
      39,
      2026,
      [profile(1, 8, 7)],
      "2026-08-04T00:00:00.000Z",
      [baselineProfile(1, 2)]
    );
    expect(snapshot.rankings.TOTAL.possession[0]).toMatchObject({
      score: 8,
      sampleSize: 7,
      baselineSample: 0,
      currentSeasonWeight: 1,
    });
  });
});
