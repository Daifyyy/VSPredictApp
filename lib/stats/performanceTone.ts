export type PerformanceTone = "positive" | "neutral" | "negative" | "unknown";

export interface PerformanceComparison {
  tone: PerformanceTone;
  opponentDelta: number | null;
  baselineDelta: number | null;
}

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function comparePerformance(
  value: number | null | undefined,
  opponent: number | null | undefined,
  baseline: number | null | undefined,
  tolerance: number,
  lowerIsBetter = false
): PerformanceComparison {
  if (!finite(value)) return { tone: "unknown", opponentDelta: null, baselineDelta: null };
  const opponentDelta = finite(opponent) ? value - opponent : null;
  const baselineDelta = finite(baseline) ? value - baseline : null;
  if (opponentDelta == null) return { tone: "unknown", opponentDelta, baselineDelta };
  const adjusted = lowerIsBetter ? -opponentDelta : opponentDelta;
  const tone = adjusted > tolerance ? "positive" : adjusted < -tolerance ? "negative" : "neutral";
  return { tone, opponentDelta, baselineDelta };
}

export function signedMetricDelta(value: number, digits = 1): string {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}
