import { describe, expect, it } from "vitest";
import { evaluateAutonomousTip, evaluateGuardedOneXTwo, type AutonomousInput } from "./autonomousPortfolio";
import { AUTONOMOUS_POLICY_VERSION, evaluateLegacyOverShadow, LEGACY_OVER_SHADOW_STRATEGY } from "./autonomousPortfolio";

const base: AutonomousInput = { strategy: "ONE_X_TWO", modelProbability: .58, secondProbability: .48, marketProbability: .54, decimalOdds: 1.8, readinessSample: 6, lowConfidence: false, sampleCount: 3, minutesToKickoff: 15 };

describe("legacy Over research comparator", () => {
  const input = { ...base, modelProbability: .6, marketProbability: .56, decimalOdds: 1.7 };
  it("retains old inclusive gates without changing the public strategy set", () => {
    expect(evaluateLegacyOverShadow(input).status).toBe("candidate");
    expect(evaluateAutonomousTip({ ...input, strategy: "OVER_25" }).status).toBe("watch");
    expect(AUTONOMOUS_POLICY_VERSION.OVER_25).toBe(2);
    expect(LEGACY_OVER_SHADOW_STRATEGY in AUTONOMOUS_POLICY_VERSION).toBe(false);
  });
  it("allows high edge only in the comparator, keeps current EV unchanged", () => {
    const high = { ...input, readinessSample: 8, marketProbability: .4 };
    expect(evaluateLegacyOverShadow(high).status).toBe("candidate");
    expect(evaluateAutonomousTip({ ...high, strategy: "OVER_25" }).status).toBe("watch");
    for (const evaluate of [evaluateLegacyOverShadow, (value: typeof input) => evaluateAutonomousTip({ ...value, strategy: "OVER_25", readinessSample: 8 })]) {
      expect(evaluate({ ...input, decimalOdds: 1.69 }).status).toBe("watch");
    }
  });
  it.each([
    { readinessSample: 5.99 }, { modelProbability: .599 }, { marketProbability: .561 },
    { sampleCount: 2 }, { minutesToKickoff: 14.99 }, { lowConfidence: true },
  ])("does not bypass old gates: %j", (override) => {
    expect(evaluateLegacyOverShadow({ ...input, ...override }).status).toBe("watch");
  });
  it("requires a real comparable market and price", () => {
    expect(evaluateLegacyOverShadow({ ...input, decimalOdds: null }).status).toBe("unavailable");
    expect(evaluateLegacyOverShadow({ ...input, marketProbability: null }).status).toBe("unavailable");
  });
});

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
    expect(evaluateAutonomousTip({ ...base, strategy: "OVER_25", modelProbability: .6, marketProbability: .56, secondProbability: undefined, decimalOdds: 1.75, readinessSample: 8 }).status).toBe("candidate");
    expect(evaluateAutonomousTip({ ...base, strategy: "BTTS_YES", modelProbability: .6, marketProbability: .58, secondProbability: undefined, decimalOdds: 1.75, readinessSample: 8 }).status).toBe("candidate");
  });
  it("nepublikuje golovy tip s malym vzorkem ani extremnim rozporem proti trhu", () => {
    const goals = { ...base, strategy: "OVER_25" as const, modelProbability: .8, marketProbability: .62, secondProbability: undefined, decimalOdds: 1.53 };
    expect(evaluateAutonomousTip({ ...goals, readinessSample: 7 }).reason).toContain("alespon 8");
    expect(evaluateAutonomousTip({ ...goals, readinessSample: 8 }).reason).toContain("nad bezpecnou hranici");
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

describe("guarded 1X2 shadow policy", () => {
  const guarded = { modelProbability: .62, marketProbability: .54, decimalOdds: 1.9, secondProbability: .30, readinessSample: 7, lowConfidence: false, sampleCount: 3, minutesToKickoff: 60 };
  it("prijme bezny kandidat", () => expect(evaluateGuardedOneXTwo(guarded).status).toBe("candidate"));
  it("ponecha pripravenost 6 jen k auditu", () => expect(evaluateGuardedOneXTwo({ ...guarded, readinessSample: 6 }).status).toBe("watch"));
  it("oznaci edge nad 15 p. b.", () => expect(evaluateGuardedOneXTwo({ ...guarded, modelProbability: .70, marketProbability: .54 }).reason).toContain("Vyrazny nesoulad"));
});
