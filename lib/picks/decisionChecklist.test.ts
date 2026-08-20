import { describe, expect, it } from "vitest";
import { buildDecisionChecklist } from "./decisionChecklist";
import type { FixtureModelForecast } from "@/lib/types";

const forecast = (over: Partial<FixtureModelForecast> = {}): FixtureModelForecast => ({
  fixtureId: 1, experimental: false, lowConfidence: false, readinessSample: 10,
  outcome: { home: .6, draw: .23, away: .17 }, goals: { home: 1.8, away: 1, over25: .6, btts: .5 },
  market: { outcomeOpen: null, outcomeClose: null, goalsOpen: null, goalsClose: null },
  marketSignals: [{ market: "1X2", side: "HOME", line: null, modelProbability: .6, openMarketProbability: .51, currentMarketProbability: .53, currentMove: .02, samples: 4, sampleAttempts: 4, lastSampleMinutesToKickoff: 60, lastSampleAt: null, points: [], closed: false, closingQuality: "pending" }],
  corners: null, cards: null, fouls: null, refereeProfile: null,
  headToHead: { teamAId: 1, teamBId: 2, meetings: [], sample: 0, teamAWins: 0, draws: 0, teamBWins: 0, goalsA: 0, goalsB: 0, over25: 0, btts: 0, advancedSample: 0, xgA: null, xgB: null, confidence: "none", olderHistory: false, updatedAt: null },
  ...over,
});

describe("buildDecisionChecklist", () => {
  it("označí stabilní rozdíl jako kandidáta", () => expect(buildDecisionChecklist(forecast())[0].status).toBe("candidate"));
  it("zamítne malý vzorek s akční větou", () => expect(buildDecisionChecklist(forecast({ readinessSample: 5, lowConfidence: true }))[0]).toMatchObject({ status: "reject", reason: expect.stringContaining("6 zápasů") }));
  it("ponechá počtové modely jen ke sledování", () => {
    const f = forecast();
    f.corners = { home: 5, away: 4, total: 9, line: 8.5, overProbability: .68, underProbability: .32, marketOverProbability: .54, marketUnderProbability: .46, overDifference: .14, version: 2, varianceRatio: 1.2, evaluatedSample: 50, smallSample: false, nextReviewSample: 100 };
    f.marketSignals.push({ ...f.marketSignals[0], market: "CORNERS", side: "OVER", line: 8.5, modelProbability: .68, currentMarketProbability: .54 });
    expect(buildDecisionChecklist(f)[2].status).toBe("watch");
  });
});
