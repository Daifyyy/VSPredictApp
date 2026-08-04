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
  compareMode: EntityType;
  home: { id: number; name?: string; logoUrl?: string };
  away: { id: number; name?: string; logoUrl?: string };
  homeCompareLeagueId: number | null;
  awayCompareLeagueId: number | null;
  europeanCup?: boolean;
}

export function buildCompareHref(x: CompareLinkSource): string | null {
  if (x.homeCompareLeagueId == null || x.awayCompareLeagueId == null) return null;
  const params = new URLSearchParams({
    mode: x.compareMode,
    homeLeague: String(x.homeCompareLeagueId),
    awayLeague: String(x.awayCompareLeagueId),
    home: String(x.home.id),
    away: String(x.away.id),
  });
  if (x.europeanCup) {
    params.set("context", "EURO_CUP");
    if (x.home.name) params.set("homeName", x.home.name);
    if (x.away.name) params.set("awayName", x.away.name);
    if (x.home.logoUrl) params.set("homeLogo", x.home.logoUrl);
    if (x.away.logoUrl) params.set("awayLogo", x.away.logoUrl);
  }
  return `/porovnani?${params.toString()}`;
}
