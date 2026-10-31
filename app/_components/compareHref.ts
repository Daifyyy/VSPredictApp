import { fixtureDetailHref } from '@/lib/fixtureDetailHref';
import type { EntityType } from "@/lib/types";

/**
 * Společný stavitel deep-linku do Porovnání (`/porovnani`) pro klikací řádky
 * zápasů/tipů/výsledků. Jeden zdroj pravdy pro „klikatelný jen když známe ligu
 * obou stran" – klub má `leagueId` u obou vždy, reprezentace má konfederaci
 * každého týmu (může chybět → `null` = neklikací řádek).
 *
 * Sdílí ho `FixtureRow` (Zápasy), `PickRow` (Tipy) i `PlayedRow` (Výsledky).
 */
export interface CompareLinkSource {
  fixtureId?: number;
  compareMode: EntityType;
  home: { id: number; name?: string; logoUrl?: string };
  away: { id: number; name?: string; logoUrl?: string };
  homeCompareLeagueId: number | null;
  awayCompareLeagueId: number | null;
  europeanCup?: boolean;
}

export function buildCompareHref(x: CompareLinkSource): string | null {
  return fixtureDetailHref(x.fixtureId);
}
