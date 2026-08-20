import type { TeamContext } from "../context";
import { perspectiveMatches, perspectiveSummary } from "../context";
import type { Candidate, TeamRule } from "../ruleTypes";
import { formTrend, leadingStreak, resultsTimeline } from "@/lib/stats/streaks";
import { clamp01, fmt } from "./util";

/**
 * Momentální forma z VÝSLEDKŮ (body W/D/L), série a směr trendu – ne jen z gólů.
 */
export const FORM_RULES: TeamRule[] = [
  // Série bez prohry / bez výhry (od nejnovějšího zápasu).
  rule("unbeaten_streak", "form", (t) => {
    const tl = resultsTimeline(perspectiveMatches(t));
    const n = leadingStreak(tl, (e) => e.result !== "L");
    if (n < 4) return null;
    return cand("positive", clamp01((n - 3) / 5), `${n} zápasů bez prohry`, tl.length < 5);
  }),
  rule("winless_streak", "form", (t) => {
    const tl = resultsTimeline(perspectiveMatches(t));
    const n = leadingStreak(tl, (e) => e.result !== "W");
    if (n < 4) return null;
    return cand("warning", clamp01((n - 3) / 5), `${n} zápasů bez výhry`, tl.length < 5);
  }),
  rule("clean_sheet_streak", "form", (t) => {
    const tl = resultsTimeline(perspectiveMatches(t));
    const n = leadingStreak(tl, (e) => e.ga === 0);
    if (n < 3) return null;
    return cand("positive", clamp01((n - 2) / 4), `${n} čistá konta v řadě`, tl.length < 5);
  }),
  rule("scoreless_streak", "form", (t) => {
    const tl = resultsTimeline(perspectiveMatches(t));
    const n = leadingStreak(tl, (e) => e.gf === 0);
    if (n < 3) return null;
    return cand("warning", clamp01((n - 2) / 4), `${n} zápasy bez vstřeleného gólu`, tl.length < 5);
  }),

  // Směr formy podle bodů na zápas (form okno vs baseline).
  rule("form_trend", "form", (t) => {
    const { form, base, formSampleSize, baseSampleSize } = formTrend(perspectiveMatches(t), t.entityType, t.now);
    if (form == null || base == null || formSampleSize < 4 || baseSampleSize < 4) return null;
    const difference = form - base;
    if (difference <= -0.75) {
      return cand("warning", clamp01(Math.abs(difference) / 2), `Klesající forma (${fmt(form)} b/zápas v posledních 4 vs ${fmt(base)} v předchozích 4)`, false);
    }
    if (difference >= 0.75) {
      return cand("positive", clamp01(difference / 2), `Stoupající forma (${fmt(form)} b/zápas v posledních 4 vs ${fmt(base)} v předchozích 4)`, false);
    }
    return null;
  }),

  // Forma z posledních 5 (W/D/L z summary).
  rule("hot_cold_form", "form", (t) => {
    const s = perspectiveSummary(t);
    if (!s || s.form.length < 5) return null;
    const wins = s.form.filter((r) => r === "W").length;
    const losses = s.form.filter((r) => r === "L").length;
    if (wins >= 4) return cand("positive", clamp01(wins / 5), `Výborná forma (${wins}V z 5)`, false);
    if (losses >= 4) return cand("warning", clamp01(losses / 5), `Slabá série (${losses}P z 5)`, false);
    return null;
  }),
];

function rule(
  id: string,
  category: TeamRule["category"],
  evaluate: (t: TeamContext) => Candidate | null
): TeamRule {
  return {
    id,
    category,
    evaluate: (t) => {
      const c = evaluate(t);
      return c ? { ...c, id, category } : null;
    },
  };
}

function cand(
  severity: Candidate["severity"],
  strength: number,
  text: string,
  lowConfidence: boolean
): Candidate {
  return { id: "", category: "form", severity, strength, text, lowConfidence };
}
