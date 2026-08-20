import type { EntityType, MatchResult, MatchStat, WindowKey } from "@/lib/types";
import { selectWindowMatches, windowsFor } from "./windows";
import { matchWeight } from "./matchWeight";

/** Jeden zápas na časové ose výsledků (nejnovější první). */
export interface TimelineEntry {
  result: MatchResult;
  gf: number;
  ga: number;
  date: string;
}

/** Výsledky týmu chronologicky od nejnovějšího (bez vážení – pro série). */
export function resultsTimeline(matches: MatchStat[]): TimelineEntry[] {
  return [...matches]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => {
      const gf = m.metrics.GOALS_FOR ?? 0;
      const ga = m.metrics.GOALS_AGAINST ?? 0;
      const result: MatchResult = gf > ga ? "W" : gf < ga ? "L" : "D";
      return { result, gf, ga, date: m.date };
    });
}

/** Délka vedoucí série (od nejnovějšího zápasu), dokud platí `pred`. */
export function leadingStreak(
  timeline: TimelineEntry[],
  pred: (e: TimelineEntry) => boolean
): number {
  let n = 0;
  for (const e of timeline) {
    if (!pred(e)) break;
    n++;
  }
  return n;
}

/** Body za výsledek (3-1-0). */
function points(r: MatchResult): number {
  return r === "W" ? 3 : r === "D" ? 1 : 0;
}

/** Vážené body na zápas (PPG) v daném okně – nese aktuálnost formy. */
export function pointsPerGame(
  matches: MatchStat[],
  window: WindowKey,
  now: Date
): number | null {
  const selected = selectWindowMatches(matches, window, now);
  let w = 0;
  let p = 0;
  for (const m of selected) {
    const gf = m.metrics.GOALS_FOR;
    const ga = m.metrics.GOALS_AGAINST;
    if (gf == null || ga == null) continue;
    const r: MatchResult = gf > ga ? "W" : gf < ga ? "L" : "D";
    const mw = matchWeight(m);
    w += mw;
    p += mw * points(r);
  }
  return w > 0 ? p / w : null;
}

/** PPG ve formovém okně vs baseline (pro detekci stoupající/klesající formy). */
function pointsPerGameFromMatches(matches: MatchStat[]): number | null {
  let weight = 0;
  let total = 0;
  for (const match of matches) {
    const gf = match.metrics.GOALS_FOR;
    const ga = match.metrics.GOALS_AGAINST;
    if (gf == null || ga == null) continue;
    const result: MatchResult = gf > ga ? "W" : gf < ga ? "L" : "D";
    const currentWeight = matchWeight(match);
    weight += currentWeight;
    total += currentWeight * points(result);
  }
  return weight > 0 ? total / weight : null;
}

/** U klubů poslední 4 zápasy vs předchozí 4 v aktuální sezoně. */
export function formTrend(
  matches: MatchStat[],
  entityType: EntityType,
  now: Date
): { form: number | null; base: number | null; formSampleSize: number; baseSampleSize: number } {
  if (entityType === "CLUB") {
    const currentSeason = [...matches]
      .filter((match) => !match.isBaseline && match.metrics.GOALS_FOR != null && match.metrics.GOALS_AGAINST != null)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (currentSeason.length < 8) {
      return {
        form: null,
        base: null,
        formSampleSize: Math.min(4, currentSeason.length),
        baseSampleSize: Math.max(0, currentSeason.length - 4),
      };
    }
    const recent = currentSeason.slice(0, 4);
    const previous = currentSeason.slice(4, 8);
    return {
      form: pointsPerGameFromMatches(recent),
      base: pointsPerGameFromMatches(previous),
      formSampleSize: recent.length,
      baseSampleSize: previous.length,
    };
  }

  const windows = windowsFor(entityType);
  return {
    base: pointsPerGame(matches, windows[0], now),
    form: pointsPerGame(matches, windows[windows.length - 1], now),
    formSampleSize: selectWindowMatches(matches, windows[windows.length - 1], now).length,
    baseSampleSize: selectWindowMatches(matches, windows[0], now).length,
  };
}
