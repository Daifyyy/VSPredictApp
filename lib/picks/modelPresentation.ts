import type { FixtureModelForecast } from "@/lib/types";
import { buildDecisionChecklist, type DecisionStatus } from "./decisionChecklist";

export type ModelScenario = {
  id: string;
  label: string;
  status: DecisionStatus;
  reason: string;
  modelProbability: number;
  marketProbability: number | null;
  openingProbability: number | null;
  difference: number | null;
  decimalOdds: number | null;
  samples: number;
  marketState: "live" | "closing" | "early" | "missing";
  research: boolean;
};

export type ModelPresentation = {
  verdict: "candidate" | "watch" | "none" | "low-data";
  title: string;
  scenario: ModelScenario | null;
  scenarios: ModelScenario[];
};

const statusWeight: Record<DecisionStatus, number> = { candidate: 3, watch: 2, reject: 1 };

function marketState(signal: FixtureModelForecast["marketSignals"][number] | undefined): ModelScenario["marketState"] {
  if (!signal) return "missing";
  if (!signal.closed) return "live";
  return signal.closingQuality === "fresh" ? "closing" : signal.closingQuality === "early" ? "early" : "missing";
}

function labelFor(signal: FixtureModelForecast["marketSignals"][number]) {
  const side = signal.side === "HOME" ? "Domácí" : signal.side === "AWAY" ? "Hosté" : signal.side === "DRAW" ? "Remíza" : signal.side === "OVER" ? "Over" : "Under";
  if (signal.market === "1X2") return side;
  if (signal.market === "OVER_25") return `${side} 2,5 gólu`;
  if (signal.market === "BTTS") return `Oba skórují · ${signal.side === "OVER" ? "Ano" : "Ne"}`;
  if (signal.market === "CORNERS") return `${side} ${signal.line?.toLocaleString("cs-CZ") ?? ""} rohů`.trim();
  if (signal.market === "CARDS") return `${side} ${signal.line?.toLocaleString("cs-CZ") ?? ""} karet`.trim();
  return signal.market;
}

function cleanerReason(reason: string) {
  return reason
    .replace(/^Splneno:\s*/i, "Splněny všechny podmínky: ")
    .replace(/^Sledovat:\s*/i, "")
    .replace(/^Nevyhovuje:\s*/i, "")
    .replace(/Efektivni/g, "Efektivní")
    .replace(/zapasu/g, "zápasů")
    .replace(/potreba/g, "potřeba")
    .replace(/alespon/g, "alespoň")
    .replace(/Modelu chybi/g, "Modelu chybí")
    .replace(/Naskok/g, "Náskok")
    .replace(/moznosti/g, "možností")
    .replace(/mensi/g, "menší")
    .replace(/Zatim/g, "Zatím")
    .replace(/kurzove/g, "kurzové")
    .replace(/vzorky/g, "vzorky")
    .replace(/Chybi/g, "Chybí")
    .replace(/srovnatelny/g, "srovnatelný")
    .replace(/referencni/g, "referenční")
    .replace(/Proti trhu chybi/g, "Proti trhu chybí")
    .replace(/pozadovane hrane/g, "požadované hraně")
    .replace(/Ocekavana hodnota/g, "Očekávaná hodnota")
    .replace(/Splneno/g, "Splněno")
    .replace(/rozdil/g, "rozdíl");
}

export function buildModelPresentation(forecast: FixtureModelForecast): ModelPresentation {
  const checks = new Map(buildDecisionChecklist(forecast).map((check) => [check.market, check]));
  const supported = forecast.marketSignals.filter((signal) =>
    ["1X2", "OVER_25", "BTTS", "CORNERS", "CARDS"].includes(signal.market) &&
    !(signal.market === "1X2" && signal.side === "DRAW")
  );
  const scenarios: ModelScenario[] = supported.map((signal) => {
    const check = checks.get(signal.market as "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS");
    return {
      id: signal.market,
      label: labelFor(signal),
      status: check?.status ?? "reject",
      reason: cleanerReason(check?.reason ?? "Chybí rozhodovací pravidlo."),
      modelProbability: signal.modelProbability,
      marketProbability: signal.currentMarketProbability,
      openingProbability: signal.openMarketProbability,
      difference: signal.modelProbability - signal.currentMarketProbability,
      decimalOdds: signal.decimalOdds ?? null,
      samples: signal.samples,
      marketState: marketState(signal),
      research: signal.market === "CORNERS" || signal.market === "CARDS",
    };
  });

  for (const side of ["home", "away"] as const) {
    for (const line of forecast.teamGoals[side].lines) {
      const market = line.currentMarketProbability ?? line.marketOverProbability;
      scenarios.push({
        id: `team-${side}-${line.line}`,
        label: `${side === "home" ? "Domácí" : "Hosté"} Over ${line.line.toFixed(1)} gólu`,
        status: market == null ? "reject" : "watch",
        reason: market == null ? "Chybí srovnatelný kurz. Výzkumný model se zatím nemění na sázku." : "Výzkumný model se zatím nemění na autonomní sázku.",
        modelProbability: line.overProbability,
        marketProbability: market,
        openingProbability: line.marketOverProbability,
        difference: market == null ? null : line.overProbability - market,
        decimalOdds: line.decimalOdds,
        samples: line.samples,
        marketState: market == null ? "missing" : "live",
        research: true,
      });
    }
  }

  scenarios.sort((a, b) =>
    statusWeight[b.status] - statusWeight[a.status] ||
    Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0) ||
    b.modelProbability - a.modelProbability ||
    a.id.localeCompare(b.id)
  );
  const primary = scenarios[0] ?? null;
  if (!primary) return { verdict: forecast.lowConfidence ? "low-data" : "none", title: forecast.lowConfidence ? "Málo dat pro rozhodnutí" : "Bez přesvědčivého scénáře", scenario: null, scenarios };
  if (primary.status === "candidate") return { verdict: "candidate", title: `Kandidát portfolia · ${primary.label}`, scenario: primary, scenarios };
  if (forecast.lowConfidence) return { verdict: "low-data", title: `Málo dat · ${primary.label}`, scenario: primary, scenarios };
  if (primary.status === "watch") return { verdict: "watch", title: `Sledovat · ${primary.label}`, scenario: primary, scenarios };
  return { verdict: "none", title: "Bez přesvědčivého scénáře", scenario: primary, scenarios };
}
