import { describe, expect, it } from "vitest";
import { complianceExposure, contentDiagnostics, nextStoryPhase, reputationProfile, statementImpact, supporterCouncil } from "./worldV8";

describe("director world v8", () => {
  it("moves stories through a finite lifecycle", () => { expect(nextStoryPhase("SIGNAL")).toBe("ESCALATION"); expect(nextStoryPhase("CLOSED")).toBe("CLOSED"); });
  it("weights supporter groups rather than averaging them", () => { const result = supporterCouncil([{ kind: "ACTIVE", size: 1000, trust: 30, conflict: 20, identitySensitivity: 1, priceSensitivity: .2 }, { kind: "FAMILY", size: 9000, trust: 75, conflict: 0, identitySensitivity: .3, priceSensitivity: .9 }], "PRICE"); expect(result.stance).toBe("SUPPORT"); });
  it("separates reach from credibility", () => { const factual = statementImpact("FACTUAL", 60, 50); const emotional = statementImpact("EMOTIONAL", 60, 50); expect(factual.credibilityDelta).toBeGreaterThan(emotional.credibilityDelta); expect(emotional.reachMultiplier).toBeGreaterThan(factual.reachMultiplier); });
  it("makes compliance disclosure deterministic", () => { const input = { exposure: 90, motivation: 90, conflict: 90, auditPressure: 90, seed: 7, traceId: "x", day: 12 }; expect(complianceExposure(input)).toEqual(complianceExposure(input)); expect(complianceExposure(input).disclosed).toBe(true); });
  it("derives reputation archetypes from dimensions", () => { const profile = reputationProfile({ sporting: 72, financial: 74, people: 55, negotiation: 50, public: 60, ethical: 80 }); expect(profile.archetypes).toContain("Sportovní architekt"); expect(profile.archetypes).toContain("Finanční stabilizátor"); });
  it("reports repeated content", () => { const report = contentDiagnostics([{ key: "x", pack: "MEDIA", headline: "Stejné", openedDay: 1 }, { key: "x", pack: "MEDIA", headline: "Stejné", openedDay: 2 }, { key: "x", pack: "MEDIA", headline: "Jiné", openedDay: 3 }]); expect(report.duplicateHeadlines).toBe(1); expect(report.repeatedKeys).toEqual(["x"]); expect(report.dominantPack).toBe("MEDIA"); });
});
