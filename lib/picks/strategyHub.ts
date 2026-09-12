import { INTUITION_POLICY_VERSION } from "./intuitionTickets";

export const STRATEGY_HUB_IDS = ["VALUE", "ELO_INTUITION", "ONE_X_TWO", "OVER_25", "BTTS_YES", "TEAM_GOALS", "CORNERS", "CARDS_REF", "FOULS"] as const;
export type StrategyHubId = typeof STRATEGY_HUB_IDS[number];

export type StrategyHubStatus = "LIVE_TEST" | "RESEARCH" | "NO_MARKET";

export interface StrategyHubDefinition {
  id: StrategyHubId;
  title: string;
  shortTitle: string;
  description: string;
  status: StrategyHubStatus;
  policyVersion: number;
  minimumSample: number;
  accumulator: boolean;
}

export const STRATEGY_HUB_CATALOG: StrategyHubDefinition[] = [
  { id: "VALUE", title: "Přísná VALUE", shortTitle: "VALUE", description: "Kombinace vítěze a gólů, které překonají tržní cenu podle hlavního modelu.", status: "LIVE_TEST", policyVersion: INTUITION_POLICY_VERSION, minimumSample: 50, accumulator: true },
  { id: "ELO_INTUITION", title: "ELO / INTUICE", shortTitle: "ELO", description: "Výsledkové Elo doplněné formou, prostředím, pedigree a dostupným lidským kontextem.", status: "RESEARCH", policyVersion: INTUITION_POLICY_VERSION, minimumSample: 50, accumulator: true },
  { id: "ONE_X_TWO", title: "Výsledek zápasu 1X2", shortTitle: "1X2", description: "Samostatné výběry na vítěze s náskokem modelu proti trhu.", status: "LIVE_TEST", policyVersion: 2, minimumSample: 200, accumulator: false },
  { id: "OVER_25", title: "Více než 2,5 gólu", shortTitle: "Over 2,5", description: "Samostatné gólové výběry s pravděpodobností a cenou zmrazenou při kvalifikaci.", status: "LIVE_TEST", policyVersion: 1, minimumSample: 200, accumulator: false },
  { id: "BTTS_YES", title: "Oba týmy skórují", shortTitle: "BTTS", description: "Výběry, u kterých model očekává gól na obou stranách a překonává trh.", status: "LIVE_TEST", policyVersion: 1, minimumSample: 200, accumulator: false },
  { id: "TEAM_GOALS", title: "Týmové góly", shortTitle: "Týmové góly", description: "Výzkumné výběry na týmové hranice 0,5 a 1,5 gólu.", status: "RESEARCH", policyVersion: 2, minimumSample: 200, accumulator: false },
  { id: "CORNERS", title: "Rohy Over / Under", shortTitle: "Rohy", description: "Výzkumné samostatné výběry nad modelem počtu rohů.", status: "RESEARCH", policyVersion: 1, minimumSample: 200, accumulator: false },
  { id: "CARDS_REF", title: "Karty s rozhodčím", shortTitle: "Karty", description: "Výzkumný model karet, který auditně zohledňuje dostupného rozhodčího.", status: "RESEARCH", policyVersion: 1, minimumSample: 200, accumulator: false },
  { id: "FOULS", title: "Prognóza faulů", shortTitle: "Fauly", description: "Početní prognóza bez dostupného sázkového trhu; ROI se nepočítá.", status: "NO_MARKET", policyVersion: 1, minimumSample: 150, accumulator: false },
];

export function isStrategyHubId(value: string | null): value is StrategyHubId {
  return STRATEGY_HUB_IDS.includes(value as StrategyHubId);
}

export function isAllowedStrategyDate(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = new Date(`${date}T12:00:00Z`).getTime();
  const base = new Date(`${today}T12:00:00Z`).getTime();
  const delta = Math.round((day - base) / 86400_000);
  return Number.isFinite(day) && delta >= -1 && delta <= 7;
}

export function isDateKey(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
