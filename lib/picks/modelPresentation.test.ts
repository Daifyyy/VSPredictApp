import { describe, expect, it } from "vitest";
import type { FixtureModelForecast } from "@/lib/types";
import { buildModelPresentation } from "./modelPresentation";

function forecast(over: Partial<FixtureModelForecast> = {}): FixtureModelForecast {
  return {
    fixtureId: 1, experimental: false, lowConfidence: false, readinessSample: 10,
    outcome: { home: .62, draw: .22, away: .16 }, goals: { home: 1.8, away: 1, over25: .61, btts: .54 },
    teamGoals: { home: { expected: 1.8, lines: [] }, away: { expected: 1, lines: [] } },
    market: { outcomeOpen: null, outcomeClose: null, goalsOpen: null, goalsClose: null },
    marketSignals: [{ market: "1X2", side: "HOME", line: null, modelProbability: .62, openMarketProbability: .52, currentMarketProbability: .54, currentMove: .02, samples: 4, sampleAttempts: 4, lastSampleMinutesToKickoff: 60, lastSampleAt: null, points: [], closed: false, closingQuality: "pending", decimalOdds: 1.9, minutesToKickoff: 60 }],
    corners: null, cards: null, fouls: null, refereeProfile: null,
    headToHead: { teamAId: 1, teamBId: 2, meetings: [], sample: 0, teamAWins: 0, draws: 0, teamBWins: 0, goalsA: 0, goalsB: 0, over25: 0, btts: 0, advancedSample: 0, xgA: null, xgB: null, confidence: "none", olderHistory: false, updatedAt: null },
    ...over,
  };
}

describe("buildModelPresentation", () => {
  it("používá portfolio bránu pro hlavní verdikt", () => {
    const result = buildModelPresentation(forecast());
    expect(result.verdict).toBe("candidate");
    expect(result.title).toContain("Domácí");
  });

  it("upřednostní omezený vzorek před zdánlivě silným signálem", () => {
    const result = buildModelPresentation(forecast({ lowConfidence: true, readinessSample: 3 }));
    expect(result.verdict).toBe("low-data");
    expect(result.scenario?.reason).toContain("Efektivní vzorek");
  });

  it("řadí kandidáta před výzkumný týmový model", () => {
    const base = forecast();
    base.teamGoals.home.lines = [{ line: 1.5, overProbability: .8, marketOverProbability: .5, currentMarketProbability: .5, decimalOdds: 2, samples: 8 }];
    const result = buildModelPresentation(base);
    expect(result.scenarios[0].id).toBe("1X2");
    expect(result.scenarios[1]).toMatchObject({ id: "team-home-1.5", status: "watch", research: true });
  });

  it("nevydává týmový model bez trhu za kandidáta", () => {
    const base = forecast({ marketSignals: [] });
    base.teamGoals.home.lines = [{ line: .5, overProbability: .85, marketOverProbability: null, currentMarketProbability: null, decimalOdds: null, samples: 0 }];
    const result = buildModelPresentation(base);
    expect(result.verdict).toBe("none");
    expect(result.scenario).toMatchObject({ status: "reject", marketProbability: null });
  });
});
