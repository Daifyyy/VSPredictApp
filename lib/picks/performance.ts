import type { PredictionRow } from "@/lib/types";
import { actualOutcome } from "./trackRecord";
import { mainHalfLine } from "./countDistribution";
import { overProbNegBin } from "./corners";
import { parseBooks, sharpLineFair } from "./books";

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
  fouls?: number | null;
}

export interface CountAccuracy {
  eligible: number;
  n: number;
  withinTolerance: number;
  toleranceRate: number | null;
  mae: number | null;
  coverage: number | null;
  tolerance: number;
  versions: CountVersionPerformance[];
}

export interface CountCalibrationBin {
  lower: number;
  upper: number;
  n: number;
  predicted: number | null;
  observed: number | null;
}

export interface CountEdgeBand {
  label: string;
  n: number;
  predicted: number | null;
  market: number | null;
  observed: number | null;
}

export interface CountVersionPerformance {
  version: number;
  varianceRatio: number;
  n: number;
  lineN: number;
  brier: number | null;
  logLoss: number | null;
  ece: number | null;
  calibration: CountCalibrationBin[];
  edgeBands: CountEdgeBand[];
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
  const versions = countVersionPerformance(rows, actual, market);
  const current = versions[0] ?? null;
  const errors: number[] = [];
  let eligible = 0;
  for (const row of rows) {
    const home = market === "corners" ? row.lambdaCornersHome : row.lambdaCardsHome;
    const away = market === "corners" ? row.lambdaCornersAway : row.lambdaCardsAway;
    if (home == null || away == null || row.homeGoals == null || row.awayGoals == null) continue;
    const version = row.countModelVersion ?? 0;
    const varianceRatio =
      (market === "corners" ? row.cornerVarianceRatio : row.cardVarianceRatio) ?? 1.2;
    if (current && (version !== current.version || varianceRatio !== current.varianceRatio)) continue;
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
    versions,
  };
}

function countVersionPerformance(
  rows: PredictionRow[],
  actual: Map<number, ActualCountTotals>,
  market: "corners" | "cards"
): CountVersionPerformance[] {
  const grouped = new Map<string, { version: number; varianceRatio: number; values: { row: PredictionRow; observed: number }[] }>();
  for (const row of rows) {
    const home = market === "corners" ? row.lambdaCornersHome : row.lambdaCardsHome;
    const away = market === "corners" ? row.lambdaCornersAway : row.lambdaCardsAway;
    const observed = actual.get(row.fixtureId)?.[market];
    if (home == null || away == null || observed == null) continue;
    const version = row.countModelVersion ?? 0;
    const varianceRatio =
      (market === "corners" ? row.cornerVarianceRatio : row.cardVarianceRatio) ?? 1.2;
    const key = `${version}:${varianceRatio}`;
    const group = grouped.get(key) ?? { version, varianceRatio, values: [] };
    group.values.push({ row, observed });
    grouped.set(key, group);
  }

  return [...grouped.values()].sort((a, b) => b.version - a.version || b.varianceRatio - a.varianceRatio).map(({ version, varianceRatio, values: group }) => {
    const evaluated = group.flatMap(({ row, observed }) => {
      const home = market === "corners" ? row.lambdaCornersHome! : row.lambdaCardsHome!;
      const away = market === "corners" ? row.lambdaCornersAway! : row.lambdaCardsAway!;
      const varianceRatio =
        (market === "corners" ? row.cornerVarianceRatio : row.cardVarianceRatio) ?? 1.2;
      const books = parseBooks(row.oddsBooks);
      const line = mainHalfLine(books, market);
      if (line == null) return [];
      const probability = overProbNegBin(home + away, line, varianceRatio);
      const marketFair = sharpLineFair(books, market, line)?.over ?? null;
      return [{ probability, outcome: observed > line ? 1 : 0, marketFair }];
    });
    const bins = Array.from({ length: 5 }, (_, index) => {
      const lower = index * 0.2;
      const upper = lower + 0.2;
      const values = evaluated.filter(({ probability }) => probability >= lower && (index === 4 ? probability <= upper : probability < upper));
      return {
        lower,
        upper,
        n: values.length,
        predicted: average(values.map((value) => value.probability)),
        observed: average(values.map((value) => value.outcome)),
      };
    });
    const withMarket = evaluated.filter((value) => value.marketFair != null);
    const edgeDefs = [
      { label: "≤ −10 p. b.", min: -Infinity, max: -0.1 },
      { label: "−10 až −5 p. b.", min: -0.1, max: -0.05 },
      { label: "−5 až +5 p. b.", min: -0.05, max: 0.05 },
      { label: "+5 až +10 p. b.", min: 0.05, max: 0.1 },
      { label: "≥ +10 p. b.", min: 0.1, max: Infinity },
    ];
    const edgeBands = edgeDefs.map((band, index) => {
      const values = withMarket.filter((value) => {
        const edge = value.probability - value.marketFair!;
        return edge >= band.min && (index === edgeDefs.length - 1 ? edge <= band.max : edge < band.max);
      });
      return {
        label: band.label,
        n: values.length,
        predicted: average(values.map((value) => value.probability)),
        market: average(values.map((value) => value.marketFair!)),
        observed: average(values.map((value) => value.outcome)),
      };
    });
    const brier = average(evaluated.map((value) => (value.probability - value.outcome) ** 2));
    const logLoss = average(evaluated.map((value) => {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, value.probability));
      return -(value.outcome * Math.log(p) + (1 - value.outcome) * Math.log(1 - p));
    }));
    const ece = evaluated.length
      ? bins.reduce((sum, bin) => sum + (bin.n / evaluated.length) * Math.abs((bin.predicted ?? 0) - (bin.observed ?? 0)), 0)
      : null;
    return {
      version,
      varianceRatio,
      n: group.length,
      lineN: evaluated.length,
      brier,
      logLoss,
      ece,
      calibration: bins,
      edgeBands,
    };
  });
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
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
