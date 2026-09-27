import { describe, expect, it } from "vitest";
import { dailyPublishedAudit } from "./dailyPublishedAudit";
import type { DailyCandidate } from "./dailySelection";

const now = new Date("2026-09-27T10:00:00Z");
const candidate: DailyCandidate = {
  id: "SIGNAL:a", sourceIds: ["SIGNAL:a"], cohortKey: "cohort", fixtureId: 1, leagueId: 39,
  kickoff: "2026-09-27T12:00:00Z", marketKey: "OVER_25", odds: 1.8, bookmaker: "Book",
  oddsAt: now.toISOString(), priceKind: "DIRECT", qualified: true, currentPriceQualified: true,
  identityValid: true, blocked: false, warnings: [], marketProbability: .5,
  benchmarkComparable: true, modelProbability: .6, probabilityKind: "MAIN_TOTAL", evidence: null,
};
const check = (extra: Partial<Parameters<typeof dailyPublishedAudit>[0]> = {}) => dailyPublishedAudit({ publishedSourceId: candidate.id, publishedOdds: 1.8, sourceRejections: [], now, ...extra });

describe("published recommendation audit", () => {
  it.each(["SOURCE_NOT_QUALIFIED", "CURRENT_PRICE_SOURCE_REJECTED", "MODEL_VERSION_CHANGED", "RESEARCH_DISABLED", "SOURCE_BLOCKED"])(
    "retains the exact rejection and withdraws %s", reason => {
      expect(check({ sourceRejections: [{ id: "SIGNAL:a", reason }] })).toMatchObject({ warning: reason, withdrawn: true, kind: "WITHDRAWN" });
    });
  it("does not apply another source rejection to the selected source", () => {
    expect(check({ sourceRejections: [{ id: "SIGNAL:b", reason: "SOURCE_NOT_QUALIFIED" }] })).toMatchObject({ warning: "SOURCE_NO_LONGER_AVAILABLE", withdrawn: false });
  });
  it("prefers a current candidate over a duplicate rejection", () => {
    expect(check({ candidate, sourceRejections: [{ id: candidate.id, reason: "SOURCE_NOT_QUALIFIED" }] }).kind).toBeNull();
  });
  it("does not withdraw due to admission deadline or mutate the original price", () => {
    const current = { ...candidate, kickoff: "2026-09-27T10:20:00Z", odds: 1.9 };
    expect(check({ candidate: current })).toEqual({ warning: null, withdrawn: false, kind: "PRICE_CHANGED" });
    expect(candidate.odds).toBe(1.8);
  });
  it("warns without inventing disqualification when a quote is missing", () => {
    expect(check({ sourceRejections: [{ id: candidate.id, reason: "NO_DIRECT_MARKET" }] })).toMatchObject({ withdrawn: false, kind: "WARNING", warning: "NO_DIRECT_MARKET" });
  });
  it("ignores a source-only admission deadline", () => {
    expect(check({ sourceRejections: [{ id: candidate.id, reason: "KICKOFF_TOO_CLOSE" }] }).kind).toBeNull();
  });
});
