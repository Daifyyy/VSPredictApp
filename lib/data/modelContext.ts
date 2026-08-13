import { isEuroCupLeague, isNationalTournamentLeague } from "./catalog";

export type ModelContext = "LEAGUE" | "EURO_CUP" | "NATIONAL";

/** Verze se mění samostatně: úprava Evropy nesmí zahodit ligový track record. */
export const MODEL_CONTEXT_VERSION: Record<ModelContext, number> = {
  LEAGUE: 1,
  EURO_CUP: 2,
  NATIONAL: 1,
};

export function modelContextForLeague(leagueId: number): ModelContext {
  if (isEuroCupLeague(leagueId)) return "EURO_CUP";
  if (isNationalTournamentLeague(leagueId)) return "NATIONAL";
  return "LEAGUE";
}

export function isCurrentContextVersion(row: {
  modelContext?: string;
  contextVersion?: number;
  leagueId: number;
}): boolean {
  const context = (row.modelContext ?? modelContextForLeague(row.leagueId)) as ModelContext;
  return row.contextVersion === MODEL_CONTEXT_VERSION[context];
}
