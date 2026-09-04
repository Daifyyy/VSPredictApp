import { describe, expect, it } from "vitest";
import { evaluateAutonomousTip, type AutonomousInput } from "./autonomousPortfolio";

const base: AutonomousInput = { strategy: "ONE_X_TWO", modelProbability: .58, secondProbability: .48, marketProbability: .54, decimalOdds: 1.8, readinessSample: 6, lowConfidence: false, sampleCount: 3, minutesToKickoff: 15 };

describe("evaluateAutonomousTip", () => {
  it("prijme presne hranice 1X2 v2", () => expect(evaluateAutonomousTip(base).status).toBe("candidate"));
  it("odmitne 57,9 %, naskok pod 10 pb a EV pod 2 %", () => {
    expect(evaluateAutonomousTip({ ...base, modelProbability: .579 }).status).toBe("watch");
    expect(evaluateAutonomousTip({ ...base, secondProbability: .481 }).status).toBe("watch");
    expect(evaluateAutonomousTip({ ...base, decimalOdds: 1.75 }).status).toBe("watch");
  });
  it("vyzaduje tri vzorky a alespon 15 minut", () => {
    expect(evaluateAutonomousTip({ ...base, sampleCount: 2 }).status).toBe("watch");
    expect(evaluateAutonomousTip({ ...base, minutesToKickoff: 14.9 }).status).toBe("watch");
  });
  it("pouzije odlisne hrany Overu a BTTS", () => {
    expect(evaluateAutonomousTip({ ...base, strategy: "OVER_25", modelProbability: .6, marketProbability: .56, secondProbability: undefined, decimalOdds: 1.75 }).status).toBe("candidate");
    expect(evaluateAutonomousTip({ ...base, strategy: "BTTS_YES", modelProbability: .6, marketProbability: .58, secondProbability: undefined, decimalOdds: 1.75 }).status).toBe("candidate");
  });
  it("použije konzervativní brány pro rohy", () => {
    const corners = { ...base, strategy: "CORNERS" as const, modelProbability: .6, marketProbability: .55, secondProbability: undefined, decimalOdds: 1.72 };
    expect(evaluateAutonomousTip(corners).status).toBe("candidate");
    expect(evaluateAutonomousTip({ ...corners, modelProbability: .599 }).status).toBe("watch");
    expect(evaluateAutonomousTip({ ...corners, marketProbability: .551 }).status).toBe("watch");
    expect(evaluateAutonomousTip({ ...corners, decimalOdds: 1.71 }).status).toBe("watch");
  });
  it("nikdy nepublikuje bez trhu nebo pri malem vzorku modelu", () => {
    expect(evaluateAutonomousTip({ ...base, marketProbability: null }).status).toBe("unavailable");
    expect(evaluateAutonomousTip({ ...base, readinessSample: 5.9 }).status).toBe("watch");
    expect(evaluateAutonomousTip({ ...base, lowConfidence: true }).status).toBe("watch");
  });
});
