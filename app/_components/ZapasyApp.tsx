"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import type {
  FixtureDay,
  LiveScore,
  PlayedFixture,
  UpcomingFixture,
} from "@/lib/types";
import { TeamLogo } from "./TeamLogo";
import { AppHeader } from "./AppHeader";
import { Empty } from "./Empty";
import { RankBadge } from "./RankBadge";
import { buildCompareHref } from "./compareHref";
import { MatchReportPanel } from "./MatchReportPanel";
import { ViewTabs } from "./ViewTabs";
import { LiveReportPanel } from "./LiveReportPanel";
import { buildTipHref } from "./tipHref";
import { useCurrentUser } from "./useCurrentUser";
import { InstallLink } from "./InstallLink";
import { preferredProgramDayIndex } from "@/lib/homeDashboard";
import { FixtureModelCard } from "./FixtureModelCard";
import { chooseFeaturedFixture } from "@/lib/homeFeaturedFixture";

type View = "program" | "results";

/** Stabilní prázdné pole (nemění referenci mezi rendery → nezpouští efekty nadarmo). */
const NO_FIXTURES: UpcomingFixture[] = [];

/**
 * Dnešek v pražské zóně (YYYY-MM-DD) na klientovi. Stránka je statická (ISR) → serverem
 * upečený „dnes" může být zastaralý (regenerace běží až na požadavek + stale-while-revalidate),
 * takže hranici dne musí určit klient podle skutečného času.
 */
function pragueToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Zachová SSR kontext (rank/tip), ale stav a skóre vezme z čerstvého dneška. */
export function mergeTodaySnapshot(
  served: FixtureDay | undefined,
  fresh: FixtureDay
): FixtureDay {
  const servedFixtures = new Map((served?.fixtures ?? []).map((fixture) => [fixture.fixtureId, fixture]));
  const servedPlayed = new Map((served?.played ?? []).map((fixture) => [fixture.fixtureId, fixture]));
  return {
    date: fresh.date,
    fixtures: fresh.fixtures.map((fixture) => {
      const old = servedFixtures.get(fixture.fixtureId);
      return old ? { ...fixture, homeRank: old.homeRank, awayRank: old.awayRank } : fixture;
    }),
    played: fresh.played.map((fixture) => {
      const old = servedPlayed.get(fixture.fixtureId);
      return old?.tip ? { ...fixture, tip: old.tip } : fixture;
    }),
  };
}

/** Synchronizace běží v Programu i Výsledcích; server ji sdílí přes krátkou cache. */
function useTodaySnapshot(today: string | null): FixtureDay | null {
  const [snapshot, setSnapshot] = useState<FixtureDay | null>(null);
  useEffect(() => {
    if (!today) return;
    let active = true;
    let lastSync = 0;
    const sync = () => {
      if (document.hidden) return;
      lastSync = Date.now();
      fetch("/api/fixtures/today")
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json() as Promise<{ day?: FixtureDay }>;
        })
        .then(({ day }) => {
          if (active && day?.date === today) setSnapshot(day);
        })
        .catch(() => {});
    };
    sync();
    const timer = setInterval(sync, 15 * 60_000);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastSync >= 5 * 60_000) sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [today]);
  return snapshot;
}

/** Následující kalendářní den z YYYY-MM-DD (čistá aritmetika, nezávislá na zóně). */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Předchozí kalendářní den z YYYY-MM-DD. */
function prevDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Živý zápas svítí, dokud je jeho výkop v tomto okně před „teď" (plausibilita pollu). */
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000;

/** Je pravděpodobné, že se právě něco hraje (→ smysl pollovat živé skóre)? */
function plausiblyLive(fixtures: UpcomingFixture[], now: number): boolean {
  return fixtures.some((f) => {
    if (f.live) return true;
    const k = new Date(f.kickoff).getTime();
    return k <= now && k >= now - LIVE_WINDOW_MS;
  });
}

/**
 * Klientský poll živého skóre (~90 s). Běží jen když je záložka viditelná a je plausibilně
 * živo (jinak 0 volání – offseason ticho). Náklad stropuje sdílená serverová cache.
 */
function useLiveScores(
  enabled: boolean,
  fixtures: UpcomingFixture[]
): {
  scores: Map<number, LiveScore>;
  loaded: boolean;
  /** Poslední poll selhal → minuty a skóre na obrazovce **stojí**. */
  failing: boolean;
  /** Čas posledního úspěšného pollu (ms), `null` dokud žádný neproběhl. */
  updatedAt: number | null;
  /** Zápasy, které dohrály za běhu stránky (viz `detectFinished`). */
  finished: PlayedFixture[];
} {
  const [scores, setScores] = useState<Map<number, LiveScore>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [failing, setFailing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [finished, setFinished] = useState<PlayedFixture[]>([]);
  // Předchozí snímek. Zapisuje se **jen v callbacku pollu**, nikdy při renderu.
  const prevScores = useRef<Map<number, LiveScore>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function tick(): Promise<void> {
      if (document.hidden || !plausiblyLive(fixtures, Date.now())) return;
      try {
        const r = await fetch("/api/fixtures/live");
        if (!r.ok) throw new Error(String(r.status));
        const d: { live?: LiveScore[] } = await r.json();
        if (!active) return;
        const map = new Map<number, LiveScore>();
        for (const l of d.live ?? []) map.set(l.fixtureId, l);

        // Co ze živé sady vypadlo, dohrálo → poskládat pro Výsledky, než dorazí rozpis.
        const done = detectFinished(prevScores.current, map, fixtures);
        prevScores.current = map;
        if (done.length > 0) {
          setFinished((cur) => {
            const known = new Set(cur.map((p) => p.fixtureId));
            const add = done.filter((p) => !known.has(p.fixtureId));
            return add.length > 0 ? [...cur, ...add] : cur;
          });
        }

        setScores(map);
        setLoaded(true);
        setFailing(false);
        setUpdatedAt(Date.now());
      } catch {
        // Živý stav je best-effort a SSR snímek zůstane – ale mlčet se nesmí:
        // zamrzlá minuta vypadá k nerozeznání od „nic se zrovna nehraje".
        if (active) setFailing(true);
      }
    }
    void tick();
    const timer = setInterval(() => void tick(), 90_000);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, fixtures]);

  return { scores, loaded, failing, updatedAt, finished };
}

/**
 * Razítko čerstvosti živého skóre. Bez něj vypadá zamrzlý poll (nebo snímek z CDN)
 * jako aktuální stav – minuta je součást tvrzení, ne dekorace. Ukazuje se jen když
 * se opravdu něco hraje, aby mimo sezónu nedělalo hluk.
 */
function LiveFreshness({
  failing,
  updatedAt,
}: {
  failing: boolean;
  updatedAt: number | null;
}) {
  if (updatedAt == null && !failing) return null;
  const time =
    updatedAt == null
      ? null
      : new Date(updatedAt).toLocaleTimeString("cs-CZ", {
          hour: "2-digit",
          minute: "2-digit",
        });
  return (
    <p
      // Odečítač se o výpadku dozví; průběžné aktualizace času by ale hlásit neměl.
      role={failing ? "status" : undefined}
      className={`mt-2 text-right text-[10px] ${failing ? "text-warning" : "text-muted"}`}
    >
      {failing
        ? `⚠ Živé skóre se nedaří obnovit${time ? ` – naposledy v ${time}` : ""}.`
        : `Živé skóre aktualizováno v ${time}`}
    </p>
  );
}

/**
 * Autoritativní překryv SSR snapshotu živým skóre: běžící zápas přepíše minutu/skóre,
 * zápas, který ze živé sady vypadl (dohráno), z Programu **zmizí** (opraví i stale SSR).
 * Dokud poll neproběhl (`loaded=false`), věříme SSR (nic neskrýváme).
 */
function mergeLive(
  fixtures: UpcomingFixture[],
  scores: Map<number, LiveScore>,
  loaded: boolean
): UpcomingFixture[] {
  return fixtures
    .filter((f) => {
      if (scores.has(f.fixtureId)) return true; // právě běží
      return !(loaded && f.live); // byl živý, teď už není → dohráno → ven
    })
    .map((f) => {
      const l = scores.get(f.fixtureId);
      if (!l) return f;
      return {
        ...f,
        live: true,
        elapsed: l.elapsed,
        liveHome: l.homeGoals,
        liveAway: l.awayGoals,
        liveStatus: l.status,
        halftimeHome: l.halftimeHome,
        halftimeAway: l.halftimeAway,
      };
    });
}

/**
 * Stavy, ze kterých se dá dohraný zápas dopočítat na klientovi. `ET`/`BT`/`P` schválně
 * chybí: `PlayedFixture.homeGoals` je **skóre po 90 minutách** (to model predikuje), ale
 * živý feed nese průběžné skóre včetně prodloužení – po rozstřelu bychom dosadili špatné
 * číslo. Takový zápas počká na rozpis; radši o pár minut později než špatně.
 */
const REGULAR_TIME_STATUSES = new Set(["1H", "HT", "2H"]);

/**
 * Zápas, který **právě zmizel ze živé sady**, je dohraný. `mergeLive` ho z Programu
 * vyhodí, ale Výsledky se počítají ze statické `days` prop, takže tam do další ISR
 * regenerace (až 10 min) nedorazil – zápas, který jsi sledoval, spadl do díry.
 * Tohle ho z posledního živého snímku poskládá a doplní do Výsledků rovnou.
 *
 * Je to **optimistický překryv**, ne zdroj pravdy: jakmile dorazí čerstvý rozpis se
 * stejným `fixtureId`, `mergePlayed` dá přednost jemu (nese i `tip` a `afterExtraTime`).
 */
function toPlayedFixture(
  f: UpcomingFixture,
  last: LiveScore
): PlayedFixture | null {
  if (!REGULAR_TIME_STATUSES.has(last.status)) return null;
  if (last.homeGoals == null || last.awayGoals == null) return null;
  return {
    fixtureId: f.fixtureId,
    leagueId: f.leagueId,
    leagueName: f.leagueName,
    leagueLogoUrl: f.leagueLogoUrl,
    kickoff: f.kickoff,
    home: f.home,
    away: f.away,
    homeGoals: last.homeGoals,
    awayGoals: last.awayGoals,
    afterExtraTime: false,
    national: f.national,
    europeanCup: f.europeanCup,
    competitionRound: f.competitionRound,
    compareMode: f.compareMode,
    homeCompareLeagueId: f.homeCompareLeagueId,
    awayCompareLeagueId: f.awayCompareLeagueId,
    // `tip` vědomě chybí – ✓/✗ dorazí až se settlem, dřív ho poctivě nevíme.
  };
}

/** Zápasy ze serveru mají přednost; dopočítané se přidají jen když v rozpisu ještě nejsou. */
function mergePlayed(
  served: PlayedFixture[],
  extra: PlayedFixture[]
): PlayedFixture[] {
  if (extra.length === 0) return served;
  const known = new Set(served.map((p) => p.fixtureId));
  const add = extra.filter((p) => !known.has(p.fixtureId));
  if (add.length === 0) return served;
  return [...served, ...add].sort((a, b) => b.kickoff.localeCompare(a.kickoff));
}

/** Oblíbené: live první, pak dle výkopu (primární sekce nahoře). */
function sortFavorites(a: UpcomingFixture, b: UpcomingFixture): number {
  const al = a.live ? 0 : 1;
  const bl = b.live ? 0 : 1;
  if (al !== bl) return al - bl;
  return a.kickoff.localeCompare(b.kickoff);
}

/** Pražský kalendářní den výkopu – aby dopočítaný zápas spadl do správného dne Výsledků. */
function pragueDayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Které zápasy z předchozího snímku v novém chybí → právě dohrály. Čistá funkce, aby
 * se dala volat z callbacku pollu (a ne z dalšího efektu – synchronní `setState` v těle
 * efektu tenhle repo zakazuje kvůli kaskádovým renderům).
 */
function detectFinished(
  prev: Map<number, LiveScore>,
  next: Map<number, LiveScore>,
  fixtures: UpcomingFixture[]
): PlayedFixture[] {
  if (prev.size === 0) return []; // první snímek nemá s čím porovnávat
  const done: PlayedFixture[] = [];
  for (const [id, last] of prev) {
    if (next.has(id)) continue; // pořád běží
    const f = fixtures.find((x) => x.fixtureId === id);
    if (!f) continue;
    const played = toPlayedFixture(f, last);
    if (played) done.push(played);
  }
  return done;
}

/** Oblíbené IDs uživatele (PRO) + optimistický toggle s revertem při chybě. */
function useFavorites(isPro: boolean): {
  favFixtures: Set<number>;
  favLeagues: Set<number>;
  toggle: (type: "fixture" | "league", id: number, on: boolean) => void;
} {
  const [favFixtures, setFavFixtures] = useState<Set<number>>(new Set());
  const [favLeagues, setFavLeagues] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isPro) return;
    let active = true;
    fetch("/api/fixtures/favorites")
      .then((r) => r.json())
      .then((d: { locked?: boolean; fixtures?: number[]; leagues?: number[] }) => {
        if (!active || d.locked) return;
        setFavFixtures(new Set(d.fixtures ?? []));
        setFavLeagues(new Set(d.leagues ?? []));
      })
      .catch(() => {
        // bez oblíbených se Program vykreslí normálně
      });
    return () => {
      active = false;
    };
  }, [isPro]);

  const toggle = useCallback(
    (type: "fixture" | "league", id: number, on: boolean) => {
      const setter = type === "fixture" ? setFavFixtures : setFavLeagues;
      const apply = (add: boolean) =>
        setter((prev) => {
          const n = new Set(prev);
          if (add) n.add(id);
          else n.delete(id);
          return n;
        });
      apply(on); // optimistic
      fetch("/api/fixtures/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id, on }),
      })
        .then((r) => {
          if (!r.ok) apply(!on); // revert
        })
        .catch(() => apply(!on));
    },
    []
  );

  return { favFixtures, favLeagues, toggle };
}

/**
 * Záložka „Zápasy" = domovská obrazovka pro rychlý přístup k predikci. Dvě části
 * (přepínač) nad **jedním** polem dní `[dnes−RESULT_DAYS … dnes+6]`: **Program** =
 * nadcházející zápasy seskupené podle ligy (klik = Porovnání s předvyplněnými týmy +
 * predikcí) a **Výsledky** = odehrané zápasy týchž lig, den po dni dozadu.
 * Seznamy jsou jen navigace – nic se nepočítá živě.
 *
 * **Ve Výsledcích je náš tip odznak, ne podmínka.** Zápas se ukáže, jakmile ho API hlásí
 * dohraný; ✓/✗ dorazí, až predikci vypořádá `settle-results`. Dřív byly Výsledky čtené
 * výhradně z uložených predikcí, takže večerní zápas v nich chyběl klidně 17 h a zápas
 * bez predikce navždy.
 */
export function ZapasyApp({
  days,
  resultDays,
}: {
  days: FixtureDay[];
  /** Kolik prvních položek `days` je minulost (kontrakt s `RESULT_DAYS` v `app/page.tsx`). */
  resultDays: number;
}) {
  // Stránka je statická (ISR) → uživatele načteme klientsky (anon = null; PRO odemkne
  // oblíbené). Krátký flash „nepřihlášen" v hlavičce je cena za CDN-cacheovaný shell.
  const user = useCurrentUser();
  const [view, setView] = useState<View>("program");
  // Vlastní kurzor pro každý pohled – pásky jedou opačným směrem, sdílený index by
  // po přepnutí skočil na náhodný den.
  const [dayIdx, setDayIdx] = useState(0);
  const [dayChosen, setDayChosen] = useState(false);
  const [resultIdx, setResultIdx] = useState(0);
  const [onlyFav, setOnlyFav] = useState(false);
  const [proCta, setProCta] = useState(false);
  const restoredHistory = useRef(false);

  // Skutečný „dnes" podle klienta (SSR snapshot může být o den starý). Přepočítá se i při
  // návratu na záložku/do popředí (PWA reopen přes noc → JS stav přežije, mount effect neběží).
  const [clientToday, setClientToday] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setClientToday(pragueToday());
    sync();
    const onVis = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  const todaySnapshot = useTodaySnapshot(clientToday);
  const syncedDays = useMemo(() => {
    if (!todaySnapshot) return days;
    const served = days.find((day) => day.date === todaySnapshot.date);
    const merged = mergeTodaySnapshot(served, todaySnapshot);
    return [
      ...days.filter((day) => day.date !== todaySnapshot.date),
      merged,
    ].sort((a, b) => a.date.localeCompare(b.date));
  }, [days, todaySnapshot]);

  // Odfiltruj minulé dny ze zastaralého snapshotu (yesterday-as-„Dnes" fix). Když by tím
  // nezbylo nic (extrémně starý snapshot), radši ukaž původní data než prázdno.
  //
  // **Do prvního renderu (SSR/hydratace) se řeže indexem, ne datem** – server a klient si
  // musí padnout do noty. `days` chodí seřazené nejstarší první, takže Program začíná na
  // `resultDays` (= dnešek dle serveru) a Výsledky berou zbytek. Po mountu rozhoduje
  // skutečný pražský „dnes" na klientovi.
  const visibleDays = useMemo(() => {
    if (!clientToday) return syncedDays.slice(resultDays);
    const future = syncedDays.filter((d) => d.date >= clientToday);
    return future.length > 0 ? future : syncedDays.slice(resultDays);
  }, [syncedDays, clientToday, resultDays]);

  const nearestDayIdx = preferredProgramDayIndex(visibleDays);
  const effectiveDayIdx = !dayChosen && dayIdx === 0 && visibleDays[0]?.fixtures.length === 0 && nearestDayIdx > 0
    ? nearestDayIdx
    : dayIdx;
  const active = visibleDays[effectiveDayIdx] ?? visibleDays[0];
  const isPro = user?.tier === "PRO";

  const {
    scores,
    loaded,
    failing,
    updatedAt,
    finished: justFinished,
  } = useLiveScores(view === "program", active?.fixtures ?? NO_FIXTURES);
  const { favFixtures, favLeagues, toggle } = useFavorites(!!isPro);

  // Výsledky jedou opačně: dnešek první, pak dozadu. Do dne se přimíchají zápasy,
  // které dohrály za běhu stránky (jinak by čekaly na ISR regeneraci, až 10 min).
  const pastDays = useMemo(() => {
    const past = clientToday
      ? syncedDays.filter((d) => d.date <= clientToday)
      : syncedDays.slice(0, resultDays + 1);
    const base = (past.length > 0 ? past : syncedDays.slice(0, resultDays + 1))
      .slice()
      .reverse();
    if (justFinished.length === 0) return base;
    return base.map((d) => {
      const extra = justFinished.filter((p) => pragueDayOf(p.kickoff) === d.date);
      const played = mergePlayed(d.played, extra);
      return played === d.played ? d : { ...d, played };
    });
  }, [syncedDays, clientToday, resultDays, justFinished]);

  // Datum a pohled jsou součástí historie URL. Po návratu z Porovnání tak nový mount
  // nevybere znovu dnešek/nejbližší den, ale obnoví přesně stránku, ze které uživatel odešel.
  useEffect(() => {
    if (!clientToday || restoredHistory.current) return;
    restoredHistory.current = true;
    const params = new URLSearchParams(window.location.search);
    const restoredView = params.get("view");
    const restoredDate = params.get("date");
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (restoredView === "results") {
        setView("results");
        const index = pastDays.findIndex((day) => day.date === restoredDate);
        if (index >= 0) setResultIdx(index);
        return;
      }
      if (restoredView === "program" || restoredDate) {
        setView("program");
        const index = visibleDays.findIndex((day) => day.date === restoredDate);
        if (index >= 0) {
          setDayChosen(true);
          setDayIdx(index);
        }
      }
    });
    return () => { active = false; };
  }, [clientToday, pastDays, visibleDays]);

  const rememberPage = useCallback((nextView: View, date?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    if (date) url.searchParams.set("date", date);
    else url.searchParams.delete("date");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const activePast = pastDays[resultIdx] ?? pastDays[0];
  const playedCount = useMemo(
    () => pastDays.reduce((n, d) => n + d.played.length, 0),
    [pastDays]
  );

  // SSR snapshot překrytý živým skóre (dohrané zmizí, běžící přepíšou minutu/skóre).
  const dayFixtures = useMemo(
    () => mergeLive(active?.fixtures ?? NO_FIXTURES, scores, loaded),
    [active, scores, loaded]
  );

  const isFavorite = useCallback(
    (f: UpcomingFixture) => favFixtures.has(f.fixtureId) || favLeagues.has(f.leagueId),
    [favFixtures, favLeagues]
  );
  const favList = useMemo(
    () => dayFixtures.filter(isFavorite).sort(sortFavorites),
    [dayFixtures, isFavorite]
  );
  const featured = useMemo(() => chooseFeaturedFixture(dayFixtures), [dayFixtures]);

  // Klik na hvězdu: PRO toggluje, ostatní dostanou PRO CTA (žádná perzistence).
  const onFavClick = useCallback(
    (type: "fixture" | "league", id: number, on: boolean) => {
      if (isPro) toggle(type, id, on);
      else setProCta(true);
    },
    [isPro, toggle]
  );

  return (
    <main className="app-page">
      <AppHeader user={user} />

      <DashboardHeader
        today={clientToday}
        todayCount={visibleDays.find((day) => day.date === clientToday)?.fixtures.length ?? 0}
        selectedDate={active?.date ?? null}
        selectedCount={dayFixtures.length}
        liveCount={dayFixtures.filter((fixture) => fixture.live).length}
        nextKickoff={dayFixtures.find((fixture) => !fixture.live)?.kickoff ?? null}
        analysisCount={dayFixtures.filter((fixture) => buildCompareHref(fixture) != null).length}
        showingNearest={Boolean(clientToday && active?.date !== clientToday && (visibleDays.find((day) => day.date === clientToday)?.fixtures.length ?? 0) === 0)}
      />

      {featured ? <FeaturedFixture fixture={featured.fixture} editorialTitle={featured.title} /> : null}

      <ViewTabs
        tabs={[
          { value: "program", label: "Program" },
          {
            value: "results",
            label: playedCount > 0 ? `Výsledky (${playedCount})` : "Výsledky",
          },
        ]}
        active={view}
        onSelect={(nextView) => {
          setView(nextView);
          rememberPage(nextView, nextView === "program" ? active?.date : activePast?.date);
        }}
      />

      {view === "program" ? (
        <>
          <DayTabs
            days={visibleDays}
            active={effectiveDayIdx}
            today={clientToday}
            direction="future"
            count={(d) => d.fixtures.length}
            onSelect={(index) => {
              setDayChosen(true);
              setDayIdx(index);
              rememberPage("program", visibleDays[index]?.date);
            }}
          />

          {proCta && (
            <ProCtaBanner
              signedIn={!!user}
              onDismiss={() => setProCta(false)}
            />
          )}

          {(favFixtures.size > 0 || favLeagues.size > 0) && (
            <FavoriteToggle onlyFav={onlyFav} onChange={setOnlyFav} />
          )}

          <LiveFreshness failing={failing} updatedAt={updatedAt} />

          {active && dayFixtures.length > 0 ? (
            <>
              {!onlyFav && favList.length > 0 && (
                <FavoritesSection
                  fixtures={favList}
                  favFixtures={favFixtures}
                  onToggleFixture={(id, on) => onFavClick("fixture", id, on)}
                />
              )}
              {onlyFav ? (
                favList.length > 0 ? (
                  <FavoritesSection
                    fixtures={favList}
                    favFixtures={favFixtures}
                    onToggleFixture={(id, on) => onFavClick("fixture", id, on)}
                  />
                ) : (
                  <Empty>
                    Na tento den nemáš žádný oblíbený zápas. Přidej si zápas nebo ligu
                    hvězdičkou, nebo vypni filtr „Jen oblíbené&ldquo;.
                  </Empty>
                )
              ) : (
                <LeagueGroups
                  fixtures={dayFixtures}
                  favFixtures={favFixtures}
                  favLeagues={favLeagues}
                  onToggleFixture={(id, on) => onFavClick("fixture", id, on)}
                  onToggleLeague={(id, on) => onFavClick("league", id, on)}
                />
              )}
            </>
          ) : (
            <SmartEmptyProgram
              days={visibleDays}
              activeIndex={effectiveDayIdx}
              onSelect={(index) => {
                setDayChosen(true);
                setDayIdx(index);
                rememberPage("program", visibleDays[index]?.date);
              }}
            />
          )}
        </>
      ) : (
        <>
          <DayTabs
            days={pastDays}
            active={resultIdx}
            today={clientToday}
            direction="past"
            count={(d) => d.played.length}
            onSelect={(index) => {
              setResultIdx(index);
              rememberPage("results", pastDays[index]?.date);
            }}
          />
          {activePast && activePast.played.length > 0 ? (
            <ResultsList played={activePast.played} />
          ) : (
            <Empty>
              Na tento den nemáme ve sledovaných ligách odehraný zápas. Zkus jiný den –
              mimo sezónu (léto) top ligy nehrají.
            </Empty>
          )}
        </>
      )}
      <QuickActions />
    </main>
  );
}

function DashboardHeader({ today, todayCount, selectedDate, selectedCount, liveCount, nextKickoff, analysisCount, showingNearest }: { today: string | null; todayCount: number; selectedDate: string | null; selectedCount: number; liveCount: number; nextKickoff: string | null; analysisCount: number; showingNearest: boolean }) {
  const selectedLabel = selectedDate
    ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })
    : "Program";
  return (
    <section className="dashboard-card mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="grid border-b border-border bg-background/55 sm:grid-cols-3">
        <PulseItem label="Program" value={`${selectedCount} ${matchWord(selectedCount)}`} />
        <PulseItem
          label="Nejbližší výkop"
          value={nextKickoff ? new Date(nextKickoff).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : "—"}
        />
        <PulseItem label="Dostupné analýzy" value={`${analysisCount}`} />
      </div>
      <div className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="page-kicker">Přehled zápasů</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{showingNearest ? "Nejbližší fotbalový program" : "Dnešní fotbal"}</h1>
          <p className="mt-1 text-sm text-muted">
            {showingNearest
              ? `Dnes se ve sledovaných ligách nehraje. Zobrazujeme ${selectedLabel}.`
              : today ? `${selectedLabel} · ${todayCount} ${matchWord(todayCount)}` : "Aktuální program sledovaných lig"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {liveCount > 0 ? <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-negative/10 px-3 text-sm font-bold text-negative"><LiveDot /> {liveCount} živě</span> : null}
          <span className="inline-flex min-h-10 items-center rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground">{selectedCount} {matchWord(selectedCount)}</span>
        </div>
      </div>
      </div>
    </section>
  );
}

function PulseItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-border px-4 py-2.5 sm:border-r sm:last:border-r-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <strong className="text-sm tabular-nums text-foreground">{value}</strong>
    </div>
  );
}

function FeaturedFixture({ fixture, editorialTitle }: { fixture: UpcomingFixture; editorialTitle: string }) {
  const href = buildCompareHref(fixture);
  const time = new Date(fixture.kickoff).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const content = (
    <div>
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-3 sm:justify-end sm:text-right"><TeamLogo src={fixture.home.logoUrl} alt={fixture.home.name} size={44} /><span><span className="block font-bold text-foreground">{fixture.home.name}</span>{fixture.homeRank ? <small className="text-muted">{fixture.homeRank}. místo</small> : null}</span></div>
        <div className="text-center"><p className={`text-xs font-bold ${fixture.live ? "text-negative" : "text-muted"}`}>{fixture.live ? `${fixture.elapsed ?? ""}' · ŽIVĚ` : time}</p><p key={`${fixture.liveHome}:${fixture.liveAway}`} className={`mt-1 text-xl font-black tabular-nums text-foreground ${fixture.live ? "reveal-pop" : ""}`}>{fixture.live ? `${fixture.liveHome ?? 0} : ${fixture.liveAway ?? 0}` : "vs."}</p></div>
        <div className="flex items-center gap-3"><TeamLogo src={fixture.away.logoUrl} alt={fixture.away.name} size={44} /><span><span className="block font-bold text-foreground">{fixture.away.name}</span>{fixture.awayRank ? <small className="text-muted">{fixture.awayRank}. místo</small> : null}</span></div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5 border-t border-border pt-3">
        {fixture.competitionRound ? <ContentTag>{fixture.competitionRound}</ContentTag> : null}
        {href ? <><ContentTag>Porovnání týmů</ContentTag><ContentTag>Model 1X2</ContentTag><ContentTag>⛳ Rohy</ContentTag><ContentTag>🟨 Karty</ContentTag></> : null}
        {fixture.live ? <ContentTag>Živý průběh</ContentTag> : null}
      </div>
    </div>
  );
  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background/70 px-4 py-2 text-xs"><span className="truncate font-semibold text-foreground">{editorialTitle}</span><span className="shrink-0 text-muted">{fixture.leagueName}</span></div>
      {href ? <Link href={href} className="featured-fixture block p-4 transition sm:p-5">{content}</Link> : <div className="p-4 sm:p-5">{content}</div>}
    </section>
  );
}

function ContentTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border bg-background/75 px-2.5 py-1 text-[11px] font-medium text-muted">{children}</span>;
}

function SmartEmptyProgram({ days, activeIndex, onSelect }: { days: FixtureDay[]; activeIndex: number; onSelect: (index: number) => void }) {
  const nextIndex = days.findIndex((day, index) => index > activeIndex && day.fixtures.length > 0);
  const next = nextIndex >= 0 ? days[nextIndex] : null;
  const label = next
    ? new Date(`${next.date}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })
    : null;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-5 text-center shadow-sm">
      <span aria-hidden className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-lg">⚽</span>
      <h2 className="mt-3 text-base font-bold text-foreground">V tento den se ve sledovaných soutěžích nehraje</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted">
        {next ? `Nejbližší program je ${label} a obsahuje ${next.fixtures.length} ${matchWord(next.fixtures.length)}.` : "Prohlédni si týmy a jejich herní profily nebo vytvoř vlastní porovnání."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {next ? <button type="button" onClick={() => onSelect(nextIndex)} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-foreground transition hover:brightness-95">Zobrazit nejbližší program</button> : null}
        <Link href="/porovnani" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:border-accent-strong/40 hover:bg-accent/10">Porovnat týmy</Link>
      </div>
    </section>
  );
}

function matchWord(count: number): string {
  return count === 1 ? "zápas" : count >= 2 && count <= 4 ? "zápasy" : "zápasů";
}

function QuickActions() {
  const actions = [
    { href: "/porovnani", eyebrow: "Tým proti týmu", label: "Porovnat dva týmy" },
    { href: "/tabulky", eyebrow: "Aktuální pořadí", label: "Ligové tabulky" },
    { href: "/tipovacka", eyebrow: "Tvůj přehled", label: "Zapsat vlastní tip" },
  ];
  return (
    <section className="mt-5 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3"><p className="page-kicker text-muted">Rychlé nástroje</p><div className="text-xs text-muted"><InstallLink /></div></div>
    <nav aria-label="Rychlé volby" className="mt-3 grid gap-2 sm:grid-cols-3">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="group flex min-h-14 items-center justify-between rounded-lg border border-border bg-background/70 px-3 py-2.5 transition hover:border-accent-strong/40 hover:bg-accent/10"
        >
          <span>
            <span className="block text-[11px] font-medium text-muted">{action.eyebrow}</span>
            <span className="block text-sm font-semibold text-foreground">{action.label}</span>
          </span>
          <span aria-hidden className="text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground">→</span>
        </Link>
      ))}
    </nav>
    </section>
  );
}

function FavoriteToggle({
  onlyFav,
  onChange,
}: {
  onlyFav: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mt-3 flex justify-end">
      <button
        type="button"
        onClick={() => onChange(!onlyFav)}
        aria-pressed={onlyFav}
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          onlyFav
            ? "border-warning bg-warning/10 text-foreground"
            : "border-border bg-surface text-muted hover:text-foreground"
        }`}
      >
        {onlyFav ? "★" : "☆"} Jen oblíbené
      </button>
    </div>
  );
}

function ProCtaBanner({
  signedIn,
  onDismiss,
}: {
  signedIn: boolean;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <span className="text-foreground">
        ⭐ Oblíbené zápasy a ligy jsou funkce PRO.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {!signedIn && (
          <button
            type="button"
            onClick={() => void signIn("google")}
            className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background transition hover:opacity-90"
          >
            Přihlásit se
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Zavřít"
          className="text-muted transition hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Primární sekce oblíbených zápasů (plochá, nad ligovými kontejnery; live první). */
function FavoritesSection({
  fixtures,
  favFixtures,
  onToggleFixture,
}: {
  fixtures: UpcomingFixture[];
  favFixtures: Set<number>;
  onToggleFixture: (id: number, on: boolean) => void;
}) {
  return (
    <section className="mt-4">
      <div className="flex items-center gap-2 px-1">
        <span aria-hidden>⭐</span>
        <h2 className="text-sm font-semibold text-foreground">Oblíbené</h2>
      </div>
      <ul className="mt-2 space-y-2">
        {fixtures.map((f) => (
          <FixtureRow
            key={f.fixtureId}
            fixture={f}
            isFavorite={favFixtures.has(f.fixtureId)}
            onToggleFavorite={(on) => onToggleFixture(f.fixtureId, on)}
          />
        ))}
      </ul>
    </section>
  );
}

// Je-li znám skutečný „dnes" (klient), labeluj podle data (odolné vůči zastaralému snapshotu);
// dokud není (SSR/hydratace), padni zpět na index, aby seděl server i klient. Dál krátký den
// v týdnu + datum (So 28. 6.). `direction` řeší jen index fallback: Program jde dopředu
// (0 = Dnes, 1 = Zítra), Výsledky dozadu (0 = Dnes, 1 = Včera).
function dayLabel(
  date: string,
  idx: number,
  today: string | null,
  direction: DayDirection
): string {
  if (today) {
    if (date === today) return "Dnes";
    if (date === nextDay(today)) return "Zítra";
    if (date === prevDay(today)) return "Včera";
  } else {
    if (idx === 0) return "Dnes";
    if (idx === 1) return direction === "future" ? "Zítra" : "Včera";
  }
  return new Date(`${date}T00:00:00`).toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

type DayDirection = "future" | "past";

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function DayTabs({
  days,
  active,
  today,
  direction,
  count,
  onSelect,
}: {
  days: FixtureDay[];
  active: number;
  today: string | null;
  direction: DayDirection;
  /** Co se počítá do bubliny – Program bere `fixtures`, Výsledky `played`. */
  count: (d: FixtureDay) => number;
  onSelect: (i: number) => void;
}) {
  // Horizontálně scrollovatelný pásek (mobile-first) – týden dní se nevejde do řady.
  return (
    <div className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map((d, i) => (
        <button
          key={d.date}
          type="button"
          onClick={() => onSelect(i)}
          aria-pressed={i === active}
          className={`ui-chip shrink-0 whitespace-nowrap px-3 text-sm font-medium transition ${
            i === active
              ? "border-accent-strong/40 bg-accent font-bold text-accent-ink shadow-sm"
              : `border-border bg-surface hover:border-accent-strong/25 hover:bg-accent/10 hover:text-foreground ${
                  isWeekend(d.date) ? "text-foreground/80" : "text-muted"
                }`
          }`}
        >
          {dayLabel(d.date, i, today, direction)}
          <span className="ml-1.5 text-xs opacity-70">({count(d)})</span>
        </button>
      ))}
    </div>
  );
}

interface LeagueGroupOf<T> {
  leagueId: number;
  name: string;
  logoUrl: string;
  fixtures: T[];
}

type LeagueGroup = LeagueGroupOf<UpcomingFixture>;

/**
 * Seskupí zápasy podle ligy. **Pořadí lig i zápasů drží pořadí vstupu** – ten je už
 * seřazený (Program dle nejbližšího výkopu, Výsledky od nejnovějšího), takže sem
 * nepatří žádné vlastní řazení, které by se s ním rozešlo.
 */
function groupByLeague<
  T extends { leagueId: number; leagueName: string; leagueLogoUrl: string; europeanCup?: boolean },
>(fixtures: T[]): LeagueGroupOf<T>[] {
  const map = new Map<number, LeagueGroupOf<T>>();
  for (const f of fixtures) {
    let g = map.get(f.leagueId);
    if (!g) {
      g = {
        leagueId: f.leagueId,
        name: f.leagueName,
        logoUrl: f.leagueLogoUrl,
        fixtures: [],
      };
      map.set(f.leagueId, g);
    }
    g.fixtures.push(f);
  }
  return [...map.values()].sort((a, b) =>
    Number(Boolean(b.fixtures[0]?.europeanCup)) - Number(Boolean(a.fixtures[0]?.europeanCup))
  );
}

function LeagueGroups({
  fixtures,
  favFixtures,
  favLeagues,
  onToggleFixture,
  onToggleLeague,
}: {
  fixtures: UpcomingFixture[];
  favFixtures: Set<number>;
  favLeagues: Set<number>;
  onToggleFixture: (id: number, on: boolean) => void;
  onToggleLeague: (id: number, on: boolean) => void;
}) {
  // Seskup dle ligy; pořadí lig dle nejbližšího výkopu (fixtures jsou už dle času).
  const groups = useMemo<LeagueGroup[]>(() => groupByLeague(fixtures), [fixtures]);

  // Rozbalené ligy (výchozí: vše sbaleno, bez auto-rozbalení).
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  return (
    <div className="mt-4 space-y-3 stagger-in">
      {groups.map((g) => (
        <LeagueContainer
          key={g.leagueId}
          group={g}
          open={expanded.has(g.leagueId)}
          onToggleOpen={() =>
            setExpanded((prev) => {
              const n = new Set(prev);
              if (n.has(g.leagueId)) n.delete(g.leagueId);
              else n.add(g.leagueId);
              return n;
            })
          }
          isLeagueFavorite={favLeagues.has(g.leagueId)}
          onToggleLeague={(on) => onToggleLeague(g.leagueId, on)}
          favFixtures={favFixtures}
          onToggleFixture={onToggleFixture}
        />
      ))}
    </div>
  );
}

function LeagueContainer({
  group,
  open,
  onToggleOpen,
  isLeagueFavorite,
  onToggleLeague,
  favFixtures,
  onToggleFixture,
}: {
  group: LeagueGroup;
  open: boolean;
  onToggleOpen: () => void;
  isLeagueFavorite: boolean;
  onToggleLeague: (on: boolean) => void;
  favFixtures: Set<number>;
  onToggleFixture: (id: number, on: boolean) => void;
}) {
  const hasLive = group.fixtures.some((f) => f.live);
  // Nejbližší (nadcházející) výkop pro přehled ve sbalené hlavičce.
  const nextKickoff = group.fixtures.find((f) => !f.live)?.kickoff;
  const nextTime = nextKickoff
    ? new Date(nextKickoff).toLocaleTimeString("cs-CZ", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section className={`ui-panel overflow-hidden ${hasLive ? "border-negative/25" : ""}`}>
      <div className="flex min-h-14 items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <TeamLogo src={group.logoUrl} alt={group.name} size={18} />
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {group.name}
          </span>
          {group.fixtures[0]?.europeanCup && group.fixtures[0]?.competitionRound && (
            <span className="hidden max-w-48 truncate text-[11px] text-muted sm:inline">
              · {group.fixtures[0].competitionRound}
            </span>
          )}
          {hasLive && <LiveDot />}
          <span className="shrink-0 text-xs text-muted">({group.fixtures.length})</span>
          {!open && nextTime && (
            <span className="shrink-0 text-xs text-muted">· {nextTime}</span>
          )}
        </button>
        <StarButton
          on={isLeagueFavorite}
          onClick={() => onToggleLeague(!isLeagueFavorite)}
          label={isLeagueFavorite ? "Odebrat ligu z oblíbených" : "Přidat ligu do oblíbených"}
        />
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={open ? "Sbalit" : "Rozbalit"}
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-background hover:text-foreground"
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <ul className="space-y-2 border-t border-border bg-background/45 p-3">
          {group.fixtures.map((f) => (
            <FixtureRow
              key={f.fixtureId}
              fixture={f}
              isFavorite={favFixtures.has(f.fixtureId)}
              onToggleFavorite={(on) => onToggleFixture(f.fixtureId, on)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pulzující červená tečka = liga/zápas má právě živý zápas. */
function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-label="Živě">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-negative opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-negative" />
    </span>
  );
}

function StarButton({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-lg leading-none transition ${
        on ? "text-warning" : "text-muted hover:text-foreground"
      }`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

function FixtureRow({
  fixture,
  isFavorite,
  onToggleFavorite,
}: {
  fixture: UpcomingFixture;
  isFavorite: boolean;
  onToggleFavorite: (on: boolean) => void;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const time = new Date(fixture.kickoff).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
  // Klikatelné, když známe „ligu" obou stran pro deep-link (klub vždy; reprezentace
  // jen když se dohledala konfederace každého týmu). Jinak neklikací karta.
  const href = buildCompareHref(fixture);
  const clickable = href != null;
  const cardClass = "ui-row block px-3 py-2.5";
  const inner = (
    <div className="grid min-h-12 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2">
      {fixture.live ? (
        <span className="flex w-10 shrink-0 flex-col items-start gap-0.5 leading-tight">
          <span className="flex items-center gap-1 text-[11px] font-bold text-negative">
            <LiveDot />
            {fixture.elapsed != null ? `${fixture.elapsed}'` : "živě"}
          </span>
        </span>
      ) : (
        <span className="w-10 shrink-0 text-[11px] leading-tight text-muted">{time}</span>
      )}
      <div className="grid min-w-0 gap-1 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <TeamLogo src={fixture.home.logoUrl} alt={fixture.home.name} size={20} />
          <span className="min-w-0 truncate font-semibold text-foreground">{fixture.home.name}</span>
          <RankBadge rank={fixture.homeRank} />
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <TeamLogo src={fixture.away.logoUrl} alt={fixture.away.name} size={20} />
          <span className="min-w-0 truncate font-semibold text-foreground">{fixture.away.name}</span>
          <RankBadge rank={fixture.awayRank} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        {fixture.live ? (
          <span className="grid gap-1 text-right text-sm font-bold tabular-nums text-negative">
            <span>{fixture.liveHome ?? 0}</span><span>{fixture.liveAway ?? 0}</span>
          </span>
        ) : (
          <span className="text-xs font-medium text-muted">Detail</span>
        )}
      {clickable && (
        <span className="shrink-0 text-muted" aria-hidden>
          ›
        </span>
      )}
      </div>
    </div>
  );
  return (
    <li className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        {href != null ? (
          <Link href={href} className={`${cardClass} transition hover:border-foreground/30`}>
            {inner}
          </Link>
        ) : (
          <div className={cardClass}>{inner}</div>
        )}
        {!fixture.live && (
          <div className="mt-1">
            <button
              type="button"
              aria-expanded={modelOpen}
              onClick={() => setModelOpen((open) => !open)}
              className="min-h-11 rounded-lg px-3 text-xs font-semibold text-muted transition hover:bg-background hover:text-foreground"
            >
              {modelOpen ? "Skrýt model" : "Model před zápasem"}
            </button>
            {modelOpen && <FixtureModelCard fixtureId={fixture.fixtureId} />}
          </div>
        )}
        {fixture.live && <LiveReportToggle fixture={fixture} />}
      </div>
      {!fixture.live && (
        <Link
          href={buildTipHref(fixture)}
          aria-label="Tipnout zápas"
          title="Tipnout zápas"
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-base leading-none text-muted transition hover:bg-background hover:text-foreground"
        >
          🎯
        </Link>
      )}
      <StarButton
        on={isFavorite}
        onClick={() => onToggleFavorite(!isFavorite)}
        label={isFavorite ? "Odebrat zápas z oblíbených" : "Přidat zápas do oblíbených; výsledková upozornění lze zapnout v nastavení"}
      />
    </li>
  );
}

/**
 * Rozbalení průběhu u živého zápasu. Tlačítko je **mimo** `<Link>` karty – uvnitř by klik
 * navigoval do Porovnání místo rozbalení (stejný důvod jako u „Přehled zápasu" ve
 * Výsledcích). Sbalením se panel odmontuje, takže se zastaví i jeho poll.
 */
function LiveReportToggle({ fixture }: { fixture: UpcomingFixture }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-1 text-[11px] font-medium text-muted transition hover:text-foreground"
      >
        {open ? "▾" : "▸"} Průběh zápasu
      </button>
      {open && (
        <div className="mt-1.5">
          <LiveReportPanel fixture={fixture} />
        </div>
      )}
    </div>
  );
}

function ResultsList({ played }: { played: PlayedFixture[] }) {
  // Jmenovatel tvoří jen před výkopem publikované tipy. Pravděpodobnostní
  // prognóza bez uloženého výběru se zde nikdy zpětně nevydává za tip.
  const tipped = played.filter((p) => p.tip);
  const leagueTips = tipped.filter((p) => !p.tip!.experimental);
  const europeanTips = tipped.filter((p) => p.tip!.experimental);
  const groups = useMemo(() => groupByLeague(played), [played]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  return (
    <div className="mt-4">
      {tipped.length > 0 && (
        <div className="space-y-1 px-1 text-xs text-muted">
          {leagueTips.length > 0 && (
            <PublishedTipSummary label="Ligové publikované tipy" fixtures={leagueTips} />
          )}
          {europeanTips.length > 0 && (
            <PublishedTipSummary
              label="Experimentální – evropské poháry"
              fixtures={europeanTips}
            />
          )}
        </div>
      )}
      <div className="mt-2 space-y-3">
        {groups.map((g) => (
          <PlayedLeagueContainer
            key={g.leagueId}
            group={g}
            open={expanded.has(g.leagueId)}
            onToggleOpen={() =>
              setExpanded((prev) => {
                const n = new Set(prev);
                if (n.has(g.leagueId)) n.delete(g.leagueId);
                else n.add(g.leagueId);
                return n;
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function PublishedTipSummary({
  label,
  fixtures,
}: {
  label: string;
  fixtures: PlayedFixture[];
}) {
  const hits = fixtures.filter((fixture) => fixture.tip?.hit).length;
  return (
    <p>
      {label}: <span className="font-semibold text-foreground">{hits} z {fixtures.length}</span>
    </p>
  );
}

/**
 * Ligový kontejner ve Výsledcích – stejný vzhled i chování jako v Programu (klikací
 * hlavička, výchozí sbaleno), jen bez hvězdy a živé tečky: oblíbené řeší Program
 * a dohraný zápas živý není. Ve sbalené hlavičce je místo nejbližšího výkopu **bilance
 * tipů** v té lize, pokud nějaké máme.
 */
function PlayedLeagueContainer({
  group,
  open,
  onToggleOpen,
}: {
  group: LeagueGroupOf<PlayedFixture>;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const tipped = group.fixtures.filter((f) => f.tip);
  const hits = tipped.filter((f) => f.tip!.hit).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <TeamLogo src={group.logoUrl} alt={group.name} size={18} />
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {group.name}
          </span>
          <span className="shrink-0 text-xs text-muted">({group.fixtures.length})</span>
          {!open && tipped.length > 0 && (
            <span className="shrink-0 text-xs text-muted">
              · {hits}/{tipped.length} ✓
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={open ? "Sbalit" : "Rozbalit"}
          className="shrink-0 text-muted transition hover:text-foreground"
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <ul className="space-y-2 px-3 pb-3">
          {group.fixtures.map((f) => (
            <PlayedRow key={f.fixtureId} fixture={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

const SIDE_LABELS: Record<"home" | "draw" | "away", string> = {
  home: "Domácí",
  draw: "Remíza",
  away: "Hosté",
};

function PlayedRow({ fixture }: { fixture: PlayedFixture }) {
  const [open, setOpen] = useState(false);
  const time = new Date(fixture.kickoff).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const href = buildCompareHref(fixture);
  const tip = fixture.tip;
  const cardClass =
    "block rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm";
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[11px] leading-tight text-muted tabular-nums">
          {time}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <TeamLogo src={fixture.home.logoUrl} alt={fixture.home.name} size={20} />
          <span className="min-w-0 truncate font-medium text-home">
            {fixture.home.name}
          </span>
          <span
            className="shrink-0 font-bold tabular-nums text-foreground"
            title={
              fixture.afterExtraTime
                ? "Stav po 90 minutách (zápas se rozhodl až v prodloužení)"
                : undefined
            }
          >
            {fixture.homeGoals}:{fixture.awayGoals}
            {fixture.afterExtraTime && (
              <span className="ml-0.5 align-super text-[9px] font-normal text-muted">
                90′
              </span>
            )}
          </span>
          <span className="min-w-0 truncate font-medium text-away">
            {fixture.away.name}
          </span>
          <TeamLogo src={fixture.away.logoUrl} alt={fixture.away.name} size={20} />
        </div>
        {tip && (
          <span
            className={`shrink-0 text-sm font-bold ${
              tip.hit ? "text-positive" : "text-negative"
            }`}
            aria-label={tip.hit ? "Predikce vyšla" : "Predikce nevyšla"}
          >
            {tip.hit ? "✓" : "✗"}
          </span>
        )}
      </div>
      {tip && (
        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">
          Publikovaný tip: {SIDE_LABELS[tip.side]} · {Math.round(tip.prob * 100)} %
          {tip.experimental ? " · experimentální" : ""}
        </div>
      )}
      <KnockoutResult fixture={fixture} />
    </>
  );
  return (
    <li className="space-y-1">
      {href != null ? (
        <Link href={href} className={`${cardClass} transition hover:border-foreground/30`}>
          {inner}
        </Link>
      ) : (
        <div className={cardClass}>{inner}</div>
      )}
      {/* Tlačítko je MIMO `Link` schválně – uvnitř by klik navigoval na Porovnání. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full rounded-lg px-3 py-1 text-left text-[11px] text-muted transition hover:text-foreground"
      >
        {open ? "▾" : "▸"} Přehled zápasu
      </button>
      {/* Panel se montuje až po otevření → fetch se pustí jen na vyžádání. */}
      {open && <MatchReportPanel match={fixture} />}
    </li>
  );
}

function KnockoutResult({ fixture }: { fixture: PlayedFixture }) {
  const extraTime = fixture.extraTimeGoals;
  const penalties = fixture.penaltyGoals;
  const advancingTeam =
    fixture.winnerTeamId === fixture.home.id
      ? fixture.home.name
      : fixture.winnerTeamId === fixture.away.id
        ? fixture.away.name
        : null;

  if (!extraTime && !penalties && !advancingTeam) return null;

  return (
    <div className="mt-1 text-[11px] text-muted">
      {fixture.homeGoals}:{fixture.awayGoals} po 90 minutách
      {extraTime ? ` · ${extraTime.home}:${extraTime.away} po prodloužení` : ""}
      {penalties ? ` · penalty ${penalties.home}:${penalties.away}` : ""}
      {advancingTeam ? ` · postupuje ${advancingTeam}` : ""}
    </div>
  );
}

