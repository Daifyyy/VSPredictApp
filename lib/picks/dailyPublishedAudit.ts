import { dailyCandidateRejection, type DailyCandidate } from "./dailySelection";

/** Change recommendation status, never the frozen publication or its accounting. */
export function dailyPublishedAudit(input: {
  publishedSourceId: string;
  publishedOdds: number;
  candidate?: DailyCandidate;
  sourceRejections: Array<{ id: string; reason: string }>;
  now: Date;
}) {
  const { candidate, now } = input;
  const reason = candidate ? dailyCandidateRejection(candidate, now)
    : input.sourceRejections.find(row => row.id === input.publishedSourceId)?.reason ?? "SOURCE_NO_LONGER_AVAILABLE";
  // Admission lead time is not a withdrawal rule for an already published pick.
  const warning = reason === "KICKOFF_TOO_CLOSE" ? null : reason;
  const withdrawn = warning != null && [
    "SOURCE_BLOCKED", "SOURCE_NOT_QUALIFIED", "CURRENT_PRICE_SOURCE_REJECTED", "INVALID_IDENTITY",
    "INACTIVE_SOURCE_POLICY", "MODEL_VERSION_CHANGED", "COUNT_VERSION_CHANGED",
    "MISSING_FROZEN_IDENTITY", "RESEARCH_DISABLED",
  ].includes(warning);
  const priceChanged = candidate != null && candidate.odds !== input.publishedOdds;
  return { warning, withdrawn,
    kind: withdrawn ? "WITHDRAWN" : priceChanged ? "PRICE_CHANGED" : warning ? "WARNING" : null,
  };
}
