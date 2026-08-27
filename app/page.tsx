import type { Metadata } from "next";
import { ZapasyApp } from "./_components/ZapasyApp";
import { getFixturesByDates, getRecentResults } from "@/lib/data/repository";
import { pragueDay } from "@/lib/data/fixtures";
import { mergeTips } from "@/lib/picks/results";
import { connection } from "next/server";
import { logError } from "@/lib/logError";
import type { FixtureDay } from "@/lib/types";
import { getResultModelReviews, mergeResultModelReviews } from "@/lib/data/resultModelReviews";

export const metadata: Metadata = {
  title: "Fotbalové zápasy dnes a tento týden",
  description:
    "Dnešní a nadcházející fotbalové zápasy, živé skóre a výsledky podle ligy. U vybraného zápasu otevřeš porovnání týmů a předzápasovou analýzu.",
};

/**
 * Domovská stránka je **statická (ISR)**: nečte cookies ani `searchParams` (starý
 * sdílený odkaz `/?home=&away=` přesměruje `middleware.ts`), přihlášeného uživatele
 * načte `ZapasyApp` klientsky (`/api/me`). Rozpis + výsledky (shodné pro všechny) se tak
 * vygenerují 1× za `revalidate` a servírují z CDN → rychlé TTFB, žádný per-request SSR
 * ani session dotaz na kritické cestě. Živé skóre dorovná klientský poll (viz `ZapasyApp`).
 */
// Vynuceně statické: datová vrstva při cache-miss volá `fetch(no-store)` (API-Football),
// což by jinak stránku překlopilo do dynamic. `force-static` to potlačí – čerstvost drží
// naše vlastní `cachedJson` TTL (Neon) a ISR regenerace každých `revalidate` s.

/** Kolik dní dopředu načítat do rozpisu (dnes + dalších 6). */
const LOOKAHEAD_DAYS = 7;

/**
 * Kolik dní **zpět** načítat kvůli Výsledkům (dnes + 3 dozadu pokryje celé kolo).
 * Minulé dny jsou v cache s dlouhým TTL (den, který skončil, se už nezmění), takže
 * po prvním naplnění stojí prakticky nic. `ZapasyApp` z nich staví pásek dní dozadu –
 * **pořadí `dates` (nejstarší první) je součást kontraktu**, viz `RESULT_DAYS` tam.
 */
const RESULT_DAYS = 3;

export default async function Home() {
  // Neon je runtime závislost; krátký výpadek během buildu nesmí zablokovat deployment.
  await connection();
  const now = new Date();
  const dates = Array.from(
    { length: RESULT_DAYS + LOOKAHEAD_DAYS },
    (_, i) =>
      pragueDay(new Date(now.getTime() + (i - RESULT_DAYS) * 24 * 60 * 60 * 1000))
  );
  let rawDays: FixtureDay[] = dates.map((date) => ({ date, fixtures: [], played: [] }));
  let results: Awaited<ReturnType<typeof getRecentResults>> = [];
  try {
    [rawDays, results] = await Promise.all([
      getFixturesByDates(dates),
      // Okno tipů musí pokrýt celý pásek dozadu (+1 den rezerva na posun půlnoci).
      getRecentResults(RESULT_DAYS + 1),
    ]);
  } catch (error) {
    // Bezpečný prázdný stav je lepší než HTTP 500; další request zkusí DB znovu.
    logError("page.home.data", error);
  }
  // Náš tip je **překryv** nad odehraným zápasem, ne podmínka jeho zobrazení.
  const withTips = mergeTips(rawDays, results);
  const reviewIds = withTips.flatMap((day) => day.played.map((fixture) => fixture.fixtureId));
  let days = withTips;
  try {
    days = mergeResultModelReviews(withTips, await getResultModelReviews(reviewIds));
  } catch (error) {
    // Modelový audit je obohacení. Výpadek DB nesmí skrýt samotné výsledky.
    logError("page.home.model-reviews", error);
  }

  return (
    <div className="flex-1">
      <ZapasyApp days={days} resultDays={RESULT_DAYS} />
      <footer className="mx-auto max-w-4xl px-4 py-6 text-center text-xs text-muted">Data: API-Football.</footer>
    </div>
  );
}
