import type { PredictionRow } from "@/lib/types";
import { rollingBinaryCalibration, rollingOutcomeCalibration } from "./rollingCalibration";
import { rollingGoalDistributionCalibration } from "./goalDistributionCalibration";

export interface CalibrationSuiteReport {
  market: "1X2" | "OVER_25" | "BTTS" | "GOAL_DISTRIBUTION";
  method: "OUTCOME_PLATT" | "BINARY_LOGISTIC" | "GOAL_DISTRIBUTION";
  parameters: unknown;
  report: {
    folds: unknown[];
    baseline: unknown;
    calibrated: unknown;
    gates: Record<string, unknown>;
    accepted: boolean;
    atGridEdge?: boolean;
  };
}

/** Jediná definice bezpečného přepočtu pro CLI i automatický cron. */
export function buildCalibrationSuite(rows: PredictionRow[]): CalibrationSuiteReport[] {
  const outcome = rollingOutcomeCalibration(rows);
  const over = rollingBinaryCalibration(rows.map((row) => ({
    probability: row.over25,
    outcome: row.homeGoals! + row.awayGoals! > 2,
    kickoff: row.kickoff,
  })));
  const btts = rollingBinaryCalibration(rows.map((row) => ({
    probability: row.bttsYes,
    outcome: row.homeGoals! > 0 && row.awayGoals! > 0,
    kickoff: row.kickoff,
  })));
  const goalDistribution = rollingGoalDistributionCalibration(rows);
  return [
    { market: "1X2", method: "OUTCOME_PLATT", parameters: outcome.finalParameters, report: outcome },
    { market: "OVER_25", method: "BINARY_LOGISTIC", parameters: over.finalParameters, report: over },
    { market: "BTTS", method: "BINARY_LOGISTIC", parameters: btts.finalParameters, report: btts },
    { market: "GOAL_DISTRIBUTION", method: "GOAL_DISTRIBUTION", parameters: goalDistribution.finalParameters, report: goalDistribution },
  ];
}

export function calibrationCandidateStatus(accepted: boolean, hasActiveShadow: boolean) {
  if (!accepted) return "REJECTED" as const;
  return hasActiveShadow ? "CHALLENGER" as const : "SHADOW" as const;
}

export function calibrationTrigger(eligibleCount: number, evaluatedCount: number, threshold = 5) {
  const pending = Math.max(0, eligibleCount - evaluatedCount);
  return { pending, shouldRun: pending >= threshold };
}
