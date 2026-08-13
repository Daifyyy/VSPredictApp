import type { BookOdds } from "@/lib/data/apiFootball";
import { marketLines, sharpLineFair, type LineMarket } from "./books";
import { overProbNegBin } from "./corners";

export const COUNT_VARIANCE_RATIO = 1.2;
export const COUNT_INTERVAL_MASS = 0.7;
export const COUNT_EXPERIMENTAL_SAMPLE = 200;

export interface CountProbability {
  count: number;
  probability: number;
}

export interface CountProbabilityInterval {
  low: number;
  high: number;
  probability: number;
}

function nextReviewSample(sample: number): 50 | 100 | 200 | null {
  if (sample < 50) return 50;
  if (sample < 100) return 100;
  if (sample < 200) return 200;
  return null;
}

/** Normalizované negativně binomické rozdělení celkového počtu. */
export function countProbabilities(
  mean: number,
  varianceRatio = COUNT_VARIANCE_RATIO
): CountProbability[] {
  if (!Number.isFinite(mean) || mean < 0) return [];
  if (mean === 0) return [{ count: 0, probability: 1 }];

  const variance = mean * Math.max(1, varianceRatio);
  const maximum = Math.min(250, Math.max(30, Math.ceil(mean + 14 * Math.sqrt(variance))));
  const probabilities: CountProbability[] = [];
  let probability: number;

  if (varianceRatio <= 1) {
    probability = Math.exp(-mean);
    for (let count = 0; count <= maximum; count++) {
      probabilities.push({ count, probability });
      probability *= mean / (count + 1);
    }
  } else {
    const shape = mean / (varianceRatio - 1);
    const success = mean / (shape + mean);
    probability = Math.pow(1 - success, shape);
    for (let count = 0; count <= maximum; count++) {
      probabilities.push({ count, probability });
      probability *= ((count + shape) / (count + 1)) * success;
    }
  }

  const sum = probabilities.reduce((total, item) => total + item.probability, 0);
  return probabilities.map((item) => ({ ...item, probability: item.probability / sum }));
}

/** Nejkratší souvislý celočíselný interval s požadovaným pokrytím. */
export function shortestProbabilityInterval(
  probabilities: CountProbability[],
  target = COUNT_INTERVAL_MASS
): CountProbabilityInterval | null {
  if (!probabilities.length) return null;
  let best: CountProbabilityInterval | null = null;
  let sum = 0;
  let left = 0;
  for (let right = 0; right < probabilities.length; right++) {
    sum += probabilities[right].probability;
    while (left <= right && sum - probabilities[left].probability >= target) {
      sum -= probabilities[left].probability;
      left++;
    }
    if (sum < target) continue;
    const candidate = {
      low: probabilities[left].count,
      high: probabilities[right].count,
      probability: sum,
    };
    const width = candidate.high - candidate.low;
    const bestWidth = best ? best.high - best.low : Number.POSITIVE_INFINITY;
    if (
      width < bestWidth ||
      (width === bestWidth && (!best || candidate.probability > best.probability)) ||
      (width === bestWidth && best && candidate.probability === best.probability && candidate.low < best.low)
    ) {
      best = candidate;
    }
  }
  return best;
}

export function topExactCounts(
  probabilities: CountProbability[],
  limit = 3
): CountProbability[] {
  return [...probabilities]
    .sort((a, b) => b.probability - a.probability || a.count - b.count)
    .slice(0, limit);
}

export function isHalfLine(line: number): boolean {
  return Number.isFinite(line) && Math.abs(line * 2 - Math.round(line * 2)) < 1e-8 && Math.abs(line - Math.round(line)) > 1e-8;
}

/** Hlavní půlková linie je ta, na které je odmaržovaný trh nejblíž 50/50. */
export function mainHalfLine(books: BookOdds[], market: LineMarket): number | null {
  return marketLines(books, market)
    .filter(({ line }) => isHalfLine(line))
    .flatMap((candidate) => {
      const fair = sharpLineFair(books, market, candidate.line);
      return fair ? [{ ...candidate, balance: Math.abs(fair.over - 0.5) }] : [];
    })
    .sort((a, b) => a.balance - b.balance || b.books - a.books || a.line - b.line)[0]?.line ?? null;
}

export function buildCountForecast(
  home: number | null | undefined,
  away: number | null | undefined,
  options: {
    books: BookOdds[];
    market: Extract<LineMarket, "corners" | "cards">;
    varianceRatio?: number | null;
    version?: number | null;
    evaluatedSample: number;
  }
) {
  if (home == null || away == null) return null;
  const total = home + away;
  const line = mainHalfLine(options.books, options.market);
  const varianceRatio = options.varianceRatio ?? COUNT_VARIANCE_RATIO;
  const overProbability = line == null ? null : overProbNegBin(total, line, varianceRatio);
  const market = line == null ? null : sharpLineFair(options.books, options.market, line);
  return {
    home,
    away,
    total,
    line,
    overProbability,
    underProbability: overProbability == null ? null : 1 - overProbability,
    marketOverProbability: market?.over ?? null,
    marketUnderProbability: market?.under ?? null,
    overDifference:
      overProbability != null && market != null ? overProbability - market.over : null,
    version: options.version ?? 0,
    varianceRatio,
    evaluatedSample: options.evaluatedSample,
    smallSample: options.evaluatedSample < COUNT_EXPERIMENTAL_SAMPLE,
    nextReviewSample: nextReviewSample(options.evaluatedSample),
  };
}
