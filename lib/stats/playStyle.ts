import type { MetricValue, PlayStyleDimension, Venue } from "@/lib/types";
import { sampleOrTotal, valueOrTotal } from "./metricLookup";
import { LOW_CONFIDENCE_SAMPLE } from "./aggregate";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Spočítá jednu hodnotu na fixní škále 0–10 pro danou metriku/výpočet.
 * Pokud data chybí, vrací null.
 */
type ScoreFn = (values: MetricValue[], venue: Venue) => number | null;

const possessionScore: ScoreFn = (values, venue) => {
  const v = valueOrTotal(values, "POSSESSION", venue);
  return v !== null ? clamp((v - 30) / 40, 0, 1) * 10 : null;
};

// Kombinační hra = střely z vápna / (vápno + mimo) → 10 = vše z vápna
const buildupScore: ScoreFn = (values, venue) => {
  const inside = valueOrTotal(values, "SHOTS_INSIDE_BOX", venue);
  if (inside === null) return null;
  // SHOTS_OUTSIDE_BOX občas chybí v API při dostupném SHOTS_INSIDE_BOX — fallback na 0
  // (= tým střílí výhradně z vápna → maximální kombinační skóre)
  const outside = valueOrTotal(values, "SHOTS_OUTSIDE_BOX", venue) ?? 0;
  const total = inside + outside;
  return total > 0 ? (inside / total) * 10 : null;
};

// Pressing = fauly/zápas; rozsah 8–20 → 0–10
const pressingScore: ScoreFn = (values, venue) => {
  const v = valueOrTotal(values, "FOULS", venue);
  return v !== null ? clamp((v - 8) / 12, 0, 1) * 10 : null;
};

// Efektivita = střely na branku / střely celkem
const efficiencyScore: ScoreFn = (values, venue) => {
  const sot = valueOrTotal(values, "SHOTS_ON_TARGET", venue);
  const s = valueOrTotal(values, "SHOTS", venue);
  if (sot === null || s === null || s === 0) return null;
  return clamp(sot / s, 0, 1) * 10;
};

// Obranná odolnost = kolik kvalitních šancí tým dovolí. xGA má přednost; u starší cache
// bez soupeřova xG použijeme skutečně inkasované góly a UI dál ukáže dostupný vzorek.
const defenseScore: ScoreFn = (values, venue) => {
  const xga = valueOrTotal(values, "XG_AGAINST", venue);
  const conceded = xga ?? valueOrTotal(values, "GOALS_AGAINST", venue);
  return conceded !== null ? clamp((2.5 - conceded) / 2, 0, 1) * 10 : null;
};

interface DimDef {
  key: PlayStyleDimension["key"];
  label: string;
  leftLabel: string;
  rightLabel: string;
  score: ScoreFn;
  sample: (values: MetricValue[], venue: Venue) => number;
}

const sampleOf = (metric: MetricValue["metric"]) =>
  (values: MetricValue[], venue: Venue) => sampleOrTotal(values, metric, venue);
const minSampleOf = (...metrics: MetricValue["metric"][]) =>
  (values: MetricValue[], venue: Venue) =>
    Math.min(...metrics.map((metric) => sampleOrTotal(values, metric, venue)));

const DIMS: DimDef[] = [
  {
    key: "possession",
    label: "Kontrola míče",
    leftLabel: "Přímá hra",
    rightLabel: "Kontrola",
    score: possessionScore,
    sample: sampleOf("POSSESSION"),
  },
  {
    key: "buildup",
    label: "Styl útoku",
    leftLabel: "Nakopávané",
    rightLabel: "Kombinační",
    score: buildupScore,
    sample: sampleOf("SHOTS_INSIDE_BOX"),
  },
  {
    key: "pressing",
    label: "Aktivita bez míče (odhad)",
    leftLabel: "Nižší aktivita",
    rightLabel: "Aktivní napadání",
    score: pressingScore,
    sample: sampleOf("FOULS"),
  },
  {
    key: "efficiency",
    label: "Efektivita střel",
    leftLabel: "Nízká",
    rightLabel: "Klinická",
    score: efficiencyScore,
    sample: minSampleOf("SHOTS", "SHOTS_ON_TARGET"),
  },
  {
    key: "defense",
    label: "Obranná odolnost",
    leftLabel: "Propustná",
    rightLabel: "Pevná",
    score: defenseScore,
    sample: (values, venue) =>
      sampleOrTotal(values, "XG_AGAINST", venue) ||
      sampleOrTotal(values, "GOALS_AGAINST", venue),
  },
];

export interface SingleTeamPlayStyleDimension {
  key: PlayStyleDimension["key"];
  label: string;
  leftLabel: string;
  rightLabel: string;
  score: number;
  available: boolean;
  sampleSize: number;
  lowConfidence: boolean;
}

export function computeSingleTeamPlayStyle(
  values: MetricValue[],
  venue: Venue
): SingleTeamPlayStyleDimension[] {
  return DIMS.map((dim) => {
    const score = dim.score(values, venue);
    const sampleSize = dim.sample(values, venue);
    return {
      key: dim.key,
      label: dim.label,
      leftLabel: dim.leftLabel,
      rightLabel: dim.rightLabel,
      score: round1(score ?? 5),
      available: score !== null,
      sampleSize,
      lowConfidence: score !== null && sampleSize < LOW_CONFIDENCE_SAMPLE,
    };
  });
}

/**
 * Spočítá 4 stylové dimenze (0–10) pro oba týmy najednou.
 * Hodnoty jsou absolutní (fixní škála), ne relativní vůči soupeři —
 * aby skóre vyjadřovalo styl týmu nezávisle na konkrétním soupeři.
 *
 * Dostupnost se řídí **výhradně daty**: chybí-li metrika, dimenze je `available: false`.
 * Dřív měly „Kontrola míče" a „Styl útoku" natvrdo příznak `unavailableForNational`, který
 * tuhle kontrolu obcházel a reprezentacím je zhasl i tehdy, když data byla – a ona jsou
 * (držení míče má 99,5 % reprezentačních zápasů se statistikami, viz `NATIONAL_EXCLUDED`).
 */
export function computePlayStyle(
  homeValues: MetricValue[],
  awayValues: MetricValue[],
  venue: Venue
): PlayStyleDimension[] {
  const home = computeSingleTeamPlayStyle(homeValues, venue);
  const away = computeSingleTeamPlayStyle(awayValues, venue);
  return home.map((dim, index) => {
    const opponent = away[index];

    return {
      key: dim.key,
      label: dim.label,
      leftLabel: dim.leftLabel,
      rightLabel: dim.rightLabel,
      homeScore: dim.score,
      awayScore: opponent.score,
      available: dim.available && opponent.available,
      homeSampleSize: dim.sampleSize,
      awaySampleSize: opponent.sampleSize,
      lowConfidence: dim.lowConfidence || opponent.lowConfidence,
    };
  });
}
