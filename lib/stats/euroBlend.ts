import type { MatchStat, MetricValue } from "@/lib/types";
import { LOW_CONFIDENCE_SAMPLE } from "./aggregate";

export const EURO_SAMPLE_CAP = 10;
export const PREVIOUS_EURO_MATCH_WEIGHT = 0.5;
export const MAX_EURO_BLEND_WEIGHT = 0.7;

export function euroSample(matches: MatchStat[]) {
  const current = matches.filter((match) => !match.isBaseline).length;
  const previous = matches.filter((match) => match.isBaseline).length;
  return {
    current,
    previous,
    effective: Math.min(EURO_SAMPLE_CAP, current + previous * PREVIOUS_EURO_MATCH_WEIGHT),
  };
}

/** 1 efektivní zápas ≈ 30 %, 3 ≈ 39 %, 5 ≈ 48 %, 8 = 61 %, 10 = 70 %. */
export function euroBlendWeight(sharedEffectiveSample: number): number {
  if (sharedEffectiveSample <= 0) return 0;
  return Math.min(MAX_EURO_BLEND_WEIGHT, 0.25 + 0.045 * Math.min(EURO_SAMPLE_CAP, sharedEffectiveSample));
}

export function blendMetricValues(
  domestic: MetricValue[],
  european: MetricValue[],
  euroWeight: number
): MetricValue[] {
  const euroByKey = new Map(european.map((value) => [`${value.metric}:${value.venue}`, value]));
  return domestic.map((leagueValue) => {
    const euroValue = euroByKey.get(`${leagueValue.metric}:${leagueValue.venue}`);
    if (!euroValue || euroValue.value == null || euroWeight <= 0) return leagueValue;
    if (leagueValue.value == null) return euroValue;
    const domesticWeight = 1 - euroWeight;
    const sampleSize = Math.round(leagueValue.sampleSize * domesticWeight + euroValue.sampleSize * euroWeight);
    return {
      ...leagueValue,
      value: round2(leagueValue.value * domesticWeight + euroValue.value * euroWeight),
      sampleSize,
      lowConfidence: sampleSize < LOW_CONFIDENCE_SAMPLE,
      breakdown: leagueValue.breakdown.map((part, index) => {
        const euroPart = euroValue.breakdown[index];
        if (part.value == null) return euroPart ?? part;
        if (!euroPart || euroPart.value == null) return part;
        return { ...part, value: round2(part.value * domesticWeight + euroPart.value * euroWeight) };
      }),
    };
  });
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
