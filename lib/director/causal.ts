import { clamp } from "./random";

export type EffectSpec = {
  sourceType: string; sourceId?: string; sourceLabel: string;
  targetType: string; targetId?: string; metric: string;
  magnitude: number; confidence?: number; startDay: number; endDay?: number | null;
  decay?: "NONE" | "LINEAR" | "EXPONENTIAL"; explanation: string;
};

export type CommitmentSpec = {
  stakeholderType: string; stakeholderId?: string; title: string;
  metric: string; target: number; tolerance?: number; baseline?: number;
  dueDay: number; severity?: "LOW" | "MEDIUM" | "HIGH"; explanation: string;
};

export function effectValue(effect: Pick<EffectSpec, "magnitude" | "confidence" | "startDay" | "endDay" | "decay">, day: number) {
  if (day < effect.startDay || (effect.endDay != null && day > effect.endDay)) return 0;
  const confidence = clamp(effect.confidence ?? 1, 0, 1);
  if (!effect.endDay || effect.decay === "NONE") return effect.magnitude * confidence;
  const duration = Math.max(1, effect.endDay - effect.startDay + 1);
  const progress = clamp((day - effect.startDay) / duration, 0, 1);
  const factor = effect.decay === "EXPONENTIAL" ? Math.exp(-3 * progress) : 1 - progress;
  return effect.magnitude * confidence * factor;
}

export function effectAppliedTotal(effect: Pick<EffectSpec, "magnitude" | "confidence" | "startDay" | "endDay" | "decay">, day: number) {
  if (day < effect.startDay) return 0;
  const confidence = clamp(effect.confidence ?? 1, 0, 1);
  if (!effect.endDay || effect.endDay <= effect.startDay) return effect.magnitude * confidence;
  const progress = clamp((day - effect.startDay + 1) / (effect.endDay - effect.startDay + 1), 0, 1);
  const eased = effect.decay === "EXPONENTIAL" ? (1 - Math.exp(-3 * progress)) / (1 - Math.exp(-3)) : progress;
  return effect.magnitude * confidence * eased;
}

export function diminishingMagnitude(base: number, sameSourceCount: number) {
  return base / Math.sqrt(1 + Math.max(0, sameSourceCount) * 0.7);
}

export function qualitativeStrength(value: number) {
  const absolute = Math.abs(value);
  if (absolute < 0.35) return "zanedbatelný";
  if (absolute < 1.25) return "mírný";
  if (absolute < 3) return "výrazný";
  return "silný";
}

export function commitmentState(input: { value: number; target: number; tolerance: number; dueDay: number; day: number; higherIsBetter?: boolean }) {
  const higher = input.higherIsBetter ?? true;
  const reached = higher ? input.value >= input.target - input.tolerance : input.value <= input.target + input.tolerance;
  if (reached) return input.day >= input.dueDay ? "FULFILLED" : "ON_TRACK";
  if (input.day >= input.dueDay) return "BROKEN";
  const distance = higher ? input.target - input.value : input.value - input.target;
  const scale = Math.max(1, Math.abs(input.target));
  return distance / scale > .2 ? "AT_RISK" : "ON_TRACK";
}

export function weightedForm(matches: Array<{ points: number; xgFor: number; xgAgainst: number; opponentStrength: number }>) {
  if (!matches.length) return 0;
  let weightSum = 0; let qualitySum = 0;
  matches.slice(-8).forEach((match, index, list) => {
    const recency = .55 + .45 * ((index + 1) / list.length);
    const resultQuality = (match.points - 1.35) / 1.65;
    const performanceQuality = clamp((match.xgFor - match.xgAgainst) / 1.8, -1, 1);
    const opponent = clamp((match.opponentStrength - 55) / 35, -.4, .6);
    const weight = recency * (1 + Math.max(0, opponent) * .25);
    qualitySum += (resultQuality * .42 + performanceQuality * .48 + opponent * .1) * weight;
    weightSum += weight;
  });
  return clamp((qualitySum / Math.max(.1, weightSum)) * 18, -20, 20);
}

export function describeDrivers(drivers: Array<{ label: string; value: number }>) {
  return [...drivers].filter((item) => Math.abs(item.value) >= .25).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((item) => ({
    label: item.label, direction: item.value > 0 ? "POSITIVE" as const : "NEGATIVE" as const,
    strength: qualitativeStrength(item.value),
  }));
}
