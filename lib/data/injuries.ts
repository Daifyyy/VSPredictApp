import type { Injury } from "@/lib/types";
import type { ApiInjury } from "./apiFootball";

/**
 * Maximální stáří záznamu o zranění, který ještě bereme jako „aktuální".
 *
 * API-Football `/injuries?team&season` vrací zranění napříč **celou sezónou** (bez vazby
 * na konkrétní zápas/datum), takže by jinak ve výpisu zůstal i hráč zraněný v dřívějším
 * zápase, který se mezitím uzdravil a nastoupil. To je nejvíc vidět u reprezentací –
 * řídký kalendář (zápasy měsíce od sebe) → „nejnovější" záznam může být starý týdny.
 * Filtrujeme proto na naší straně (API filtr podle stáří neumí).
 */
export const INJURY_MAX_AGE_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Vybere aktuálně relevantní zranění z hrubé odpovědi API.
 * - Zahodí záznamy bez `fixture.date` (nelze ověřit aktuálnost → raději neukázat).
 * - Zahodí záznamy starší než {@link INJURY_MAX_AGE_DAYS} (uzdravené/neaktuální).
 * - Dedup dle hráče: ponechá nejnovější záznam (ten je ten aktuální).
 * Čistá funkce (kvůli testu) – `now` injektovatelné.
 */
export function selectCurrentInjuries(
  raw: ApiInjury[],
  now: Date = new Date()
): Injury[] {
  const minMs = now.getTime() - INJURY_MAX_AGE_DAYS * DAY_MS;

  const fresh = raw
    .map((it) => {
      const ts = it.fixture?.date ? Date.parse(it.fixture.date) : NaN;
      return { it, ts };
    })
    .filter(({ ts }) => Number.isFinite(ts) && ts >= minMs)
    // Nejnovější první → první výskyt hráče je ten aktuální.
    .sort((a, b) => b.ts - a.ts);

  return dedupeInjuryList(fresh.map(({ it }) => ({
    playerId: it.player.id,
    name: it.player.name,
    reason: it.reason || it.type || "Zranění",
  })));
}

/** Poslední obranná vrstva i pro starší cache/API tvar: ID nebo normalizované jméno. */
export function dedupeInjuryList(injuries: Injury[]): Injury[] {
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  const out: Injury[] = [];
  for (const injury of injuries) {
    const nameKey = normalizePlayerName(injury.name);
    if (seenIds.has(injury.playerId) || (nameKey && seenNames.has(nameKey))) continue;
    seenIds.add(injury.playerId);
    if (nameKey) seenNames.add(nameKey);
    out.push(injury);
  }
  return out;
}
