import type { PredictionRow } from "@/lib/types";

export const PUBLICATION_POLICY_VERSION = 1;
export const PUBLICATION_MIN_PROB = 0.55;
export const PUBLICATION_MIN_GAP = 0.1;
export const PUBLICATION_MIN_READINESS = 6;

export interface PublishedOutcomeTip {
  side: "home" | "away";
  prob: number;
  policyVersion: number;
}

/** Pevná předzápasová publikační brána. Remíza ani těsný argmax nejsou tip. */
export function publishedOutcomeTip(
  row: Pick<
    PredictionRow,
    | "available"
    | "lowConfidence"
    | "readinessSample"
    | "homeWin"
    | "draw"
    | "awayWin"
  >
): PublishedOutcomeTip | null {
  if (!row.available || row.lowConfidence || row.readinessSample < PUBLICATION_MIN_READINESS) {
    return null;
  }
  const ranked = [
    { side: "home" as const, prob: row.homeWin },
    { side: "draw" as const, prob: row.draw },
    { side: "away" as const, prob: row.awayWin },
  ].sort((a, b) => b.prob - a.prob);
  const [first, second] = ranked;
  if (first.side === "draw" || first.prob < PUBLICATION_MIN_PROB) return null;
  if (first.prob - second.prob < PUBLICATION_MIN_GAP) return null;
  return { side: first.side, prob: first.prob, policyVersion: PUBLICATION_POLICY_VERSION };
}
