import type { FixtureModelForecast } from "@/lib/types";
import { evaluateAutonomousTip, type AutonomousStrategy } from "./autonomousPortfolio";

export type DecisionStatus = "candidate" | "watch" | "reject";
export interface DecisionCheck {
  market: "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS";
  label: string;
  status: DecisionStatus;
  reason: string;
}

/** V1 zůstává pouze jako neměnný archiv v DB. V2 sama nevytváří druhou sázku. */
export const DECISION_CHECKLIST_VERSION = 2;

export interface DecisionSignalInput {
  market: DecisionCheck["market"];
  modelContext: string;
  lowConfidence: boolean;
  readinessSample: number;
  modelProbability: number | null;
  marketProbability: number | null;
  samples: number;
  currentMove: number;
  decimalOdds?: number | null;
  minutesToKickoff?: number;
  secondProbability?: number;
}

const labels = { "1X2": "Výsledek 1X2", OVER_25: "Góly 2,5", BTTS: "Oba skórují", CORNERS: "Rohy", CARDS: "Karty" } as const;

/** Stejné brány jako autonomní portfolio; checklist je pouze jejich vysvětlení. */
export function evaluateDecisionSignal(input: DecisionSignalInput): DecisionCheck {
  const base = { market: input.market, label: labels[input.market] };
  if (input.modelProbability == null)
    return { ...base, status: "reject", reason: "Nevyhovuje: chybí použitelná předzápasová prognóza." };
  if (input.modelContext === "EURO_CUP")
    return { ...base, status: "watch", reason: "Sledovat: evropský model je samostatný experiment a nevytváří ligový portfolio výběr." };
  if (input.market === "CORNERS" || input.market === "CARDS")
    return { ...base, status: "watch", reason: "Sledovat: početní model je výzkumný a zatím nevytváří autonomní sázku." };
  const strategy: AutonomousStrategy = input.market === "1X2" ? "ONE_X_TWO" : input.market === "OVER_25" ? "OVER_25" : "BTTS_YES";
  const decision = evaluateAutonomousTip({ strategy, modelProbability: input.modelProbability, marketProbability: input.marketProbability, decimalOdds: input.decimalOdds ?? null, secondProbability: input.secondProbability, readinessSample: input.readinessSample, lowConfidence: input.lowConfidence, sampleCount: input.samples, minutesToKickoff: input.minutesToKickoff ?? Number.POSITIVE_INFINITY });
  return { ...base, status: decision.status === "candidate" ? "candidate" : decision.status === "unavailable" ? "reject" : "watch", reason: decision.reason };
}

export function buildDecisionChecklist(forecast: FixtureModelForecast): DecisionCheck[] {
  const second = [...Object.values(forecast.outcome)].sort((a, b) => b - a)[1];
  return (["1X2", "OVER_25", "BTTS", "CORNERS", "CARDS"] as const).map((market) => {
    const signal = forecast.marketSignals.find((item) => item.market === market);
    return evaluateDecisionSignal({ market, modelContext: forecast.experimental ? "EURO_CUP" : "LEAGUE", lowConfidence: forecast.lowConfidence, readinessSample: forecast.readinessSample, modelProbability: signal?.modelProbability ?? null, marketProbability: signal?.currentMarketProbability ?? null, samples: signal?.samples ?? 0, currentMove: signal?.currentMove ?? 0, decimalOdds: signal?.decimalOdds ?? null, minutesToKickoff: signal?.minutesToKickoff, secondProbability: market === "1X2" ? second : undefined });
  });
}
