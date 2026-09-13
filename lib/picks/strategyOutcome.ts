import { binaryOutcome } from "./evaluation";

export interface StrategyOutcomeInput {
  storedHit?: boolean | null;
  market: string;
  side: string;
  line: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  actualCount?: number | null;
}

/** Jednotné vyhodnocení strategie. Nový settlement má přednost, starší neměnný
 * snapshot lze bezpečně vyhodnotit z již uloženého konečného výsledku. */
export function resolvedStrategyOutcome(input: StrategyOutcomeInput): boolean | null {
  if (input.storedHit != null) return input.storedHit;
  return binaryOutcome(input.market, input.side, input.homeGoals, input.awayGoals, input.line, input.actualCount ?? null);
}
