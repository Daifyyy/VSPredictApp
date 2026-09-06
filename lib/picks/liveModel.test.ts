import { describe, expect, it } from "vitest";
import { calculateLiveModel, evaluateLiveCandidate } from "./liveModel";

describe("live model", () => {
  it("respects current score and caps live influence", () => {
    const result = calculateLiveModel({ minute: 60, scoreHome: 2, scoreAway: 0, preMatchLambdaHome: 1.5, preMatchLambdaAway: 1.1, readinessSample: 10, lowConfidence: false, home: { XG: 4, SHOTS_ON_TARGET: 8 }, away: { XG: .2, SHOTS_ON_TARGET: 1 } });
    expect(result.probabilities.home).toBeGreaterThan(.8);
    expect(result.remainingLambdaHome).toBeLessThan(1.5 * (34 / 94) * 1.26);
  });

  it("requires window, edge, EV and confirmation", () => {
    const base = { minute: 30, lowConfidence: false, blocked: false, stopped: false, modelProbability: .62, marketProbability: .55, decimalOdds: 1.8, confirmed: true, synchronized: true };
    expect(evaluateLiveCandidate(base).status).toBe("candidate");
    expect(evaluateLiveCandidate({ ...base, minute: 81 }).status).toBe("reject");
    expect(evaluateLiveCandidate({ ...base, confirmed: false }).status).toBe("watch");
  });
});
