import type { FixtureModelForecast } from "@/lib/types";

export type DecisionStatus = "candidate" | "watch" | "reject";
export interface DecisionCheck {
  market: "1X2" | "OVER_25" | "CORNERS" | "CARDS";
  label: string;
  status: DecisionStatus;
  reason: string;
}

export const DECISION_CHECKLIST_VERSION = 1;

export interface DecisionSignalInput {
  market: DecisionCheck["market"];
  modelContext: string;
  lowConfidence: boolean;
  readinessSample: number;
  modelProbability: number | null;
  marketProbability: number | null;
  samples: number;
  currentMove: number;
}

const labels = { "1X2": "Výsledek 1X2", OVER_25: "Góly 2,5", CORNERS: "Rohy", CARDS: "Karty" } as const;

export function evaluateDecisionSignal(input: DecisionSignalInput): DecisionCheck {
  const base = { market: input.market, label: labels[input.market] };
  if (input.modelProbability == null)
    return { ...base, status: "reject", reason: "Nevyhovuje: chybí použitelná předzápasová prognóza tohoto trhu." };
  if (input.marketProbability == null)
    return { ...base, status: "reject", reason: "Nevyhovuje: nemáme srovnatelnou tržní cenu a u počtových trhů stejnou půlkovou linii." };
  if (input.lowConfidence || input.readinessSample < 6)
    return { ...base, status: "reject", reason: `Nevyhovuje: efektivní vzorek je jen ${input.readinessSample.toFixed(1)}; počkej alespoň na 6 zápasů.` };
  const edge = input.modelProbability - input.marketProbability;
  if (edge <= 0)
    return { ...base, status: "reject", reason: "Nevyhovuje: aktuální tržní cena už nenabízí modelovou převahu." };
  if (input.modelContext === "EURO_CUP")
    return { ...base, status: "watch", reason: "Sledovat: evropský model je experimentální; vyčkej na samostatně ověřenou kalibraci a CLV." };
  if (input.market === "CORNERS" || input.market === "CARDS")
    return { ...base, status: "watch", reason: `Sledovat: rozdíl je +${(edge * 100).toFixed(1)} p. b., ale tento počtový model zatím nevydává ověřené tipy.` };
  if (input.samples < 3)
    return { ...base, status: "watch", reason: `Sledovat: máme jen ${input.samples} použitelný kurzový vzorek; počkej, zda rozdíl přetrvá alespoň ve 3 bodech.` };
  if (input.currentMove <= -0.03)
    return { ...base, status: "watch", reason: "Sledovat: trh se výrazně pohybuje proti modelu; před rozhodnutím ověř sestavy a nové informace." };
  if (edge + Number.EPSILON * 10 < 0.05)
    return { ...base, status: "watch", reason: `Sledovat: modelová převaha je jen +${(edge * 100).toFixed(1)} p. b.; počkej na lepší cenu nebo potvrzení pohybu.` };
  return { ...base, status: "candidate", reason: `Kandidát dle pravidla: rozdíl +${(edge * 100).toFixed(1)} p. b. přetrval v ${input.samples} kurzových vzorcích.` };
}

/** Rozhodovací pomůcka nad uloženými daty; nevytváří ani nepublikuje sázku. */
export function buildDecisionChecklist(forecast: FixtureModelForecast): DecisionCheck[] {
  return (["1X2", "OVER_25", "CORNERS", "CARDS"] as const).map((market) => {
    const signal = forecast.marketSignals.find((item) => item.market === market);
    return evaluateDecisionSignal({
      market,
      modelContext: forecast.experimental ? "EURO_CUP" : "LEAGUE",
      lowConfidence: forecast.lowConfidence,
      readinessSample: forecast.readinessSample,
      modelProbability: signal?.modelProbability ?? null,
      marketProbability: signal?.currentMarketProbability ?? null,
      samples: signal?.samples ?? 0,
      currentMove: signal?.currentMove ?? 0,
    });
  });
}
