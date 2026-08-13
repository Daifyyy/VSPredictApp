import type { PredictionRow } from "@/lib/types";
import { actualOutcome } from "./trackRecord";

export interface PublishedTipRecord {
  n: number;
  hits: number;
  hitRate: number | null;
  pending: number;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  policyVersions: number[];
}

export interface ActualCountTotals {
  corners: number | null;
  cards: number | null;
}

export interface CountAccuracy {
  eligible: number;
  n: number;
  withinTolerance: number;
  toleranceRate: number | null;
  mae: number | null;
  coverage: number | null;
  tolerance: number;
}

export interface CountModelAccuracy {
  corners: CountAccuracy;
  cards: CountAccuracy;
}

export function computePublishedTipRecord(rows: PredictionRow[]): PublishedTipRecord {
  const published = rows.filter(
    (row) =>
      (row.published1x2Side === "home" || row.published1x2Side === "away") &&
      row.published1x2Prob != null &&
      row.publicationPolicyVersion != null &&
      row.publishedAt != null
  );
  const settled = published.filter(
    (row) => row.homeGoals != null && row.awayGoals != null
  );
  const hits = settled.filter(
    (row) =>
      row.published1x2Side === actualOutcome(row.homeGoals!, row.awayGoals!)
  ).length;
  const dates = published.map((row) => row.publishedAt!).sort();
  return {
    n: settled.length,
    hits,
    hitRate: settled.length ? hits / settled.length : null,
    pending: published.length - settled.length,
    firstPublishedAt: dates[0] ?? null,
    lastPublishedAt: dates.at(-1) ?? null,
    policyVersions: [...new Set(published.map((row) => row.publicationPolicyVersion!))].sort(
      (a, b) => a - b
    ),
  };
}

function countAccuracy(
  rows: PredictionRow[],
  actual: Map<number, ActualCountTotals>,
  market: "corners" | "cards",
  tolerance = 1
): CountAccuracy {
  const errors: number[] = [];
  let eligible = 0;
  for (const row of rows) {
    const home = market === "corners" ? row.lambdaCornersHome : row.lambdaCardsHome;
    const away = market === "corners" ? row.lambdaCornersAway : row.lambdaCardsAway;
    if (home == null || away == null || row.homeGoals == null || row.awayGoals == null) continue;
    eligible++;
    const observed = actual.get(row.fixtureId)?.[market];
    if (observed == null) continue;
    errors.push(Math.abs(home + away - observed));
  }
  const withinTolerance = errors.filter((error) => error <= tolerance).length;
  return {
    eligible,
    n: errors.length,
    withinTolerance,
    toleranceRate: errors.length ? withinTolerance / errors.length : null,
    mae: errors.length ? errors.reduce((sum, error) => sum + error, 0) / errors.length : null,
    coverage: eligible ? errors.length / eligible : null,
    tolerance,
  };
}

export function computeCountModelAccuracy(
  rows: PredictionRow[],
  actual: Map<number, ActualCountTotals>
): CountModelAccuracy {
  return {
    corners: countAccuracy(rows, actual, "corners"),
    cards: countAccuracy(rows, actual, "cards"),
  };
}
