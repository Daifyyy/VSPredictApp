import type { BookOdds } from "@/lib/data/apiFootball";
import { marketLines, type LineMarket } from "./books";
import { overProbNegBin } from "./corners";

export const COUNT_VARIANCE_RATIO = 1.2;
export const COUNT_INTERVAL_MASS = 0.7;
export const COUNT_DIRECTION_MIN_PROBABILITY = 0.65;
export const COUNT_DIRECTION_MIN_SAMPLE = 6;

export interface CountProbability {
  count: number;
  probability: number;
}

export interface CountProbabilityInterval {
  low: number;
  high: number;
  probability: number;
}

export interface CountDirection {
  side: "over" | "under";
  line: number;
  probability: number;
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

/** Nejlépe pokrytá skutečně uložená půlková linie. */
export function mainHalfLine(books: BookOdds[], market: LineMarket): number | null {
  return marketLines(books, market).find(({ line }) => isHalfLine(line))?.line ?? null;
}

export function chooseCountDirection(
  line: number,
  overProbability: number,
  reliable: boolean,
  minimum = COUNT_DIRECTION_MIN_PROBABILITY
): CountDirection | null {
  if (!reliable) return null;
  const underProbability = 1 - overProbability;
  if (overProbability >= minimum) return { side: "over", line, probability: overProbability };
  if (underProbability >= minimum) return { side: "under", line, probability: underProbability };
  return null;
}

export function buildCountForecast(
  home: number | null | undefined,
  away: number | null | undefined,
  options: {
    books: BookOdds[];
    market: Extract<LineMarket, "corners" | "cards">;
    lowConfidence: boolean;
    readinessSample: number;
  }
) {
  if (home == null || away == null) return null;
  const total = home + away;
  const probabilities = countProbabilities(total);
  const interval = shortestProbabilityInterval(probabilities);
  if (!interval) return null;
  const line = mainHalfLine(options.books, options.market);
  const reliable = !options.lowConfidence && options.readinessSample >= COUNT_DIRECTION_MIN_SAMPLE;
  const overProbability = line == null ? null : overProbNegBin(total, line, COUNT_VARIANCE_RATIO);
  return {
    home,
    away,
    total,
    interval,
    topCounts: topExactCounts(probabilities),
    line,
    overProbability,
    underProbability: overProbability == null ? null : 1 - overProbability,
    reliable,
    direction:
      line == null || overProbability == null
        ? null
        : chooseCountDirection(line, overProbability, reliable),
  };
}
