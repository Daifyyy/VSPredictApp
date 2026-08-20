import type { FixtureModelForecast } from "@/lib/types";

export type DecisionStatus = "candidate" | "watch" | "reject";
export interface DecisionCheck {
  market: "1X2" | "OVER_25" | "CORNERS" | "CARDS";
  label: string;
  status: DecisionStatus;
  reason: string;
}

const labels = { "1X2": "Výsledek 1X2", OVER_25: "Góly 2,5", CORNERS: "Rohy", CARDS: "Karty" } as const;

/** Rozhodovací pomůcka nad uloženými daty; nevytváří ani nepublikuje sázku. */
export function buildDecisionChecklist(forecast: FixtureModelForecast): DecisionCheck[] {
  return (["1X2", "OVER_25", "CORNERS", "CARDS"] as const).map((market) => {
    const signal = forecast.marketSignals.find((item) => item.market === market);
    const base = { market, label: labels[market] };
    if ((market === "CORNERS" && !forecast.corners) || (market === "CARDS" && !forecast.cards))
      return { ...base, status: "reject" as const, reason: "Nevyhovuje: chybí použitelná předzápasová prognóza tohoto trhu." };
    if (!signal)
      return { ...base, status: "reject" as const, reason: "Nevyhovuje: nemáme srovnatelnou tržní cenu a u počtových trhů stejnou půlkovou linii." };
    if (forecast.lowConfidence || forecast.readinessSample < 6)
      return { ...base, status: "reject" as const, reason: `Nevyhovuje: efektivní vzorek je jen ${forecast.readinessSample.toFixed(1)}; počkej alespoň na 6 zápasů.` };
    const edge = signal.modelProbability - signal.currentMarketProbability;
    if (edge <= 0)
      return { ...base, status: "reject" as const, reason: "Nevyhovuje: aktuální tržní cena už nenabízí modelovou převahu." };
    if (forecast.experimental)
      return { ...base, status: "watch" as const, reason: "Sledovat: evropský model je experimentální; vyčkej na samostatně ověřenou kalibraci a CLV." };
    if (market === "CORNERS" || market === "CARDS")
      return { ...base, status: "watch" as const, reason: `Sledovat: rozdíl je +${(edge * 100).toFixed(1)} p. b., ale tento počtový model zatím nevydává ověřené tipy.` };
    if (signal.samples < 3)
      return { ...base, status: "watch" as const, reason: `Sledovat: máme jen ${signal.samples} použitelný kurzový vzorek; počkej, zda rozdíl přetrvá alespoň ve 3 bodech.` };
    if (signal.currentMove <= -0.03)
      return { ...base, status: "watch" as const, reason: "Sledovat: trh se výrazně pohybuje proti modelu; před rozhodnutím ověř sestavy a nové informace." };
    if (edge < 0.05)
      return { ...base, status: "watch" as const, reason: `Sledovat: modelová převaha je jen +${(edge * 100).toFixed(1)} p. b.; počkej na lepší cenu nebo potvrzení pohybu.` };
    return { ...base, status: "candidate" as const, reason: `Kandidát dle pravidla: rozdíl +${(edge * 100).toFixed(1)} p. b. přetrval v ${signal.samples} kurzových vzorcích.` };
  });
}
