"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CompareResult,
  EntityType,
  Injury,
  League,
  LeagueGoalsAvg,
  LeagueTable,
  Metric,
  Scorer,
  Standing,
  Venue,
} from "@/lib/types";
import { isEuroCupLeague } from "@/lib/data/catalog";
import { METRIC_LABELS, METRIC_HINTS, LOWER_IS_BETTER } from "@/lib/types";
import { leagueDisplayName } from "@/lib/data/catalog";
import { MetricRow } from "./MetricRow";
import { MatchVerdict } from "./MatchVerdict";
import { MatchPrediction } from "./MatchPrediction";
import { KeySignals } from "./KeySignals";
import { FormSummary } from "./FormSummary";
import { InsightChips } from "./InsightChips";
import { InjuryList } from "./InjuryList";
import { StandingContext } from "./StandingContext";
import { StandingsTable, ZoneLegend } from "./StandingsTable";
import { ScorerList } from "./ScorerList";
import { CategoryScores } from "./CategoryScores";
import { PlayStyleChart } from "./PlayStyleChart";
import { computeCategoryScores } from "@/lib/stats/categories";
import { computePlayStyle } from "@/lib/stats/playStyle";
import { TeamHeading } from "./TeamHeading";
import { TeamCombobox } from "./TeamCombobox";
import { AppHeader } from "./AppHeader";
import { Empty as SharedEmpty } from "./Empty";
import { ProLock } from "./ProLock";
import {
  FavoritesSection,
  type SavedFavorite,
  type Selection,
} from "./FavoritesSection";
import type { SessionUser } from "./sessionUser";
import { FixtureModelCard } from "./FixtureModelCard";
import { HeadToHeadCard } from "./HeadToHeadCard";
import type { TacticalProfile } from "@/lib/tactics";

interface TeamLite {
  id: number;
  name: string;
  logoUrl: string;
  country: string;
}

/** Počáteční výběr načtený z URL (server page → props). */
export interface InitialSelection {
  fixture?: number;
  mode?: EntityType;
  homeLeague?: number;
  awayLeague?: number;
  home?: number;
  away?: number;
  context?: "EURO_CUP";
  venue?: Venue;
  analysis?: ViewMode;
}

const VENUE_LABELS: Record<Venue, string> = {
  HOME: "Doma",
  AWAY: "Venku",
  TOTAL: "Celkově",
};

function firstLeagueId(leagues: League[], mode: EntityType): number | null {
  const kind = mode === "CLUB" ? "CLUB_LEAGUE" : "NATIONAL_COMP";
  return leagues.find((l) => l.kind === kind)?.id ?? null;
}

interface CompareSetters {
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setResult: (v: CompareResult | null) => void;
}

/** Načte týmy zvolené ligy (prefetch hned po výběru ligy). */
function useTeams(leagueId: number | null): { teams: TeamLite[]; error: boolean } {
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (leagueId == null) return;
    let active = true;
    fetch(`/api/teams?league=${leagueId}`)
      .then((r) => {
        if (!r.ok) throw new Error("teams");
        return r.json();
      })
      .then((d) => {
        if (active) {
          setTeams(d.teams ?? []);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setTeams([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [leagueId]);
  return { teams, error };
}

/** Líně dotáhne zranění týmu (mimo kritickou cestu porovnání). */
function useInjuries(
  teamId: number | null,
  leagueId: number | null,
  enabled: boolean
): { injuries: Injury[]; failed: boolean } {
  const [state, setState] = useState<{ injuries: Injury[]; failed: boolean }>({
    injuries: [],
    failed: false,
  });
  useEffect(() => {
    if (!enabled || teamId == null || leagueId == null) return;
    let active = true;
    fetch(`/api/injuries?team=${teamId}&league=${leagueId}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (active) setState({ injuries: d.injuries ?? [], failed: false });
      })
      // **Prázdno tady není totéž co chyba.** Chybějící sekce zraněných se čte jako
      // „kádr je kompletní" – což je tvrzení o zápase, ne o načítání. Proto se to rozliší.
      .catch(() => active && setState({ injuries: [], failed: true }));
    return () => {
      active = false;
    };
  }, [teamId, leagueId, enabled]);
  return state;
}

/** Líně dotáhne postavení týmu v ligové tabulce a ligový průměr gólů (FREE kontext). */
function useStanding(
  teamId: number | null,
  leagueId: number | null,
  enabled: boolean
): { standing: Standing | null; leagueAvg: LeagueGoalsAvg | null } {
  const [standing, setStanding] = useState<Standing | null>(null);
  const [leagueAvg, setLeagueAvg] = useState<LeagueGoalsAvg | null>(null);
  useEffect(() => {
    if (!enabled || teamId == null || leagueId == null) return;
    let active = true;
    fetch(`/api/standings?team=${teamId}&league=${leagueId}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) {
          setStanding(d.standing ?? null);
          setLeagueAvg(d.leagueAvg ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setStanding(null);
          setLeagueAvg(null);
        }
      });
    return () => {
      active = false;
    };
  }, [teamId, leagueId, enabled]);
  return { standing, leagueAvg };
}

/** Líně dotáhne celou ligovou tabulku (FREE; jen klub vs. klub stejné ligy). */
function useLeagueTable(
  leagueId: number | null,
  enabled: boolean
): LeagueTable | null {
  const [table, setTable] = useState<LeagueTable | null>(null);
  useEffect(() => {
    // ResultPanel je keyed na dvojici týmů → při změně ligy/týmů remountuje se svěží
    // state, takže při vypnutí stačí nefetchovat (žádný synchronní setState v efektu).
    if (!enabled || leagueId == null) return;
    let active = true;
    fetch(`/api/standings/table?league=${leagueId}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setTable(d.table ?? null);
      })
      .catch(() => active && setTable(null));
    return () => {
      active = false;
    };
  }, [leagueId, enabled]);
  return table;
}

/** Líně dotáhne nejlepší střelce týmu ze žebříčku ligy (FREE kontext, mimo porovnání). */
function useScorers(
  teamId: number | null,
  leagueId: number | null,
  enabled: boolean
): Scorer[] {
  const [scorers, setScorers] = useState<Scorer[]>([]);
  useEffect(() => {
    if (!enabled || teamId == null || leagueId == null) return;
    let active = true;
    fetch(`/api/scorers?team=${teamId}&league=${leagueId}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setScorers(d.scorers ?? []);
      })
      .catch(() => active && setScorers([]));
    return () => {
      active = false;
    };
  }, [teamId, leagueId, enabled]);
  return scorers;
}

// Mimo tělo efektu → žádné synchronní setState v efektu (React 19 pravidlo).
// `unlock` = žádost o 1× trial PRO (server případně spotřebuje trial a vrátí plný výsledek).
async function runCompare(
  homeId: number,
  awayId: number,
  homeLeague: number,
  awayLeague: number,
  unlock: boolean,
  europeanCup: boolean,
  isActive: () => boolean,
  { setLoading, setError, setResult }: CompareSetters
): Promise<CompareResult | null> {
  setLoading(true);
  setError(null);
  try {
    const r = await fetch(
      `/api/compare?home=${homeId}&away=${awayId}&homeLeague=${homeLeague}&awayLeague=${awayLeague}${
        europeanCup ? "&context=EURO_CUP" : ""
      }${
        unlock ? "&unlock=1" : ""
      }`
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Chyba porovnání");
    if (!isActive()) return null;
    setResult(d as CompareResult);
    return d as CompareResult;
  } catch (e) {
    if (isActive()) setError(e instanceof Error ? e.message : "Chyba porovnání");
    return null;
  } finally {
    if (isActive()) setLoading(false);
  }
}

export function CompareApp({
  leagues,
  initial,
  user,
}: {
  leagues: League[];
  initial?: InitialSelection;
  user: SessionUser | null;
}) {
  const initialMode = initial?.mode ?? "CLUB";
  const [mode, setMode] = useState<EntityType>(initialMode);
  const [homeLeagueId, setHomeLeagueId] = useState<number | null>(
    initial?.homeLeague ?? firstLeagueId(leagues, initialMode)
  );
  const [awayLeagueId, setAwayLeagueId] = useState<number | null>(
    initial?.awayLeague ?? firstLeagueId(leagues, initialMode)
  );
  const europeanCup =
    homeLeagueId != null &&
    homeLeagueId === awayLeagueId &&
    isEuroCupLeague(homeLeagueId);
  const [homeId, setHomeId] = useState<number | null>(initial?.home ?? null);
  const [awayId, setAwayId] = useState<number | null>(initial?.away ?? null);
  const fixtureId =
    initial?.fixture != null && initial.home === homeId && initial.away === awayId
      ? initial.fixture
      : null;
  const [venue, setVenue] = useState<Venue>(initial?.venue ?? "TOTAL");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lokální stav trialu (zrcadlí DB) – po využití nabízej upgrade místo trialu.
  const [trialUsed, setTrialUsed] = useState<boolean>(user?.proTrialUsed ?? false);
  const [unlocking, setUnlocking] = useState(false);
  const trialAvailable = user?.tier === "FREE" && !trialUsed;
  // Po načtení oblíbeného ukaž snapshot „jak to bylo" a přeskoč auto-fetch.
  const skipAutoRef = useRef(false);
  const [savedView, setSavedView] = useState<string | null>(null);
  const isPro = user?.tier === "PRO";

  const { teams: homeTeams, error: homeTeamsError } = useTeams(homeLeagueId);
  const { teams: awayTeams, error: awayTeamsError } = useTeams(awayLeagueId);

  // Zranění se tahají líně, až je výsledek na obrazovce (mimo kritickou cestu).
  const { injuries: homeInjuries, failed: homeInjuriesFailed } = useInjuries(
    homeId,
    homeLeagueId,
    result != null
  );
  const { injuries: awayInjuries, failed: awayInjuriesFailed } = useInjuries(
    awayId,
    awayLeagueId,
    result != null
  );

  // Ligová tabulka (FREE kontext) – líně, až je výsledek na obrazovce.
  const { standing: homeStanding, leagueAvg: homeLeagueAvg } = useStanding(homeId, homeLeagueId, result != null && !europeanCup);
  const { standing: awayStanding } = useStanding(awayId, awayLeagueId, result != null && !europeanCup);

  // Nejlepší střelci ligy (FREE kontext) – líně, jako tabulka.
  const homeScorers = useScorers(homeId, homeLeagueId, result != null && !europeanCup);
  const awayScorers = useScorers(awayId, awayLeagueId, result != null && !europeanCup);

  const modeLeagues = useMemo(
    () =>
      leagues.filter((l) =>
        mode === "CLUB" ? l.kind === "CLUB_LEAGUE" : l.kind === "NATIONAL_COMP"
      ),
    [leagues, mode]
  );

  // Reset výběru se řeší v event handlerech (ne v efektu) — doporučený vzor.
  function handleMode(next: EntityType) {
    if (next === mode) return;
    setMode(next);
    const first = firstLeagueId(leagues, next);
    setHomeLeagueId(first);
    setAwayLeagueId(first);
    setHomeId(null);
    setAwayId(null);
    setResult(null);
    // Reprezentace jsou venue-neutrální → vždy Celkově (přepínač se skryje).
    if (next === "NATIONAL") setVenue("TOTAL");
  }

  function handleHomeLeague(id: number) {
    setHomeLeagueId(id);
    setHomeId(null);
    setResult(null);
  }

  function handleAwayLeague(id: number) {
    setAwayLeagueId(id);
    setAwayId(null);
    setResult(null);
  }

  // Prohození domácí ⇄ host (liga i tým). Auto-fetch efekt přepočítá výsledek.
  function handleSwap() {
    setHomeLeagueId(awayLeagueId);
    setAwayLeagueId(homeLeagueId);
    setHomeId(awayId);
    setAwayId(homeId);
    setSavedView(null);
  }

  // Vyčisti výběr týmů a výsledek (ligy/konfederace nechej navolené).
  function handleReset() {
    setHomeId(null);
    setAwayId(null);
    setResult(null);
    setSavedView(null);
    setError(null);
  }

  // Porovnej, jakmile jsou vybrané oba (různé) týmy.
  const canCompare =
    homeId != null &&
    awayId != null &&
    homeId !== awayId &&
    homeLeagueId != null &&
    awayLeagueId != null;
  useEffect(() => {
    if (!canCompare) return;
    // Načtení oblíbeného nastaví ID i snapshot → tento jeden auto-fetch přeskoč.
    if (skipAutoRef.current) {
      skipAutoRef.current = false;
      return;
    }
    setSavedView(null);
    let active = true;
    void runCompare(
      homeId,
      awayId,
      homeLeagueId,
      awayLeagueId,
      false,
      europeanCup,
      () => active,
      { setLoading, setError, setResult }
    );
    return () => {
      active = false;
    };
  }, [canCompare, homeId, awayId, homeLeagueId, awayLeagueId, europeanCup]);

  // Načti uložené porovnání: ukaž snapshot okamžitě, bez nového fetchu.
  function applyFavorite(fav: SavedFavorite) {
    skipAutoRef.current = true;
    setMode(fav.mode);
    setHomeLeagueId(fav.homeLeagueId);
    setAwayLeagueId(fav.awayLeagueId);
    setHomeId(fav.homeTeamId);
    setAwayId(fav.awayTeamId);
    setError(null);
    setResult(fav.snapshot);
    setSavedView(new Date(fav.savedAt).toLocaleDateString("cs-CZ"));
  }

  // Aktualizuj zobrazené (uložené) porovnání čerstvými daty.
  function refreshCurrent() {
    if (!canCompare) return;
    setSavedView(null);
    void runCompare(
      homeId,
      awayId,
      homeLeagueId,
      awayLeagueId,
      false,
      europeanCup,
      () => true,
      { setLoading, setError, setResult }
    );
  }

  // Trial: odemkni plnou PRO verzi tohoto jednoho porovnání (server spotřebuje trial).
  async function handleUnlockTrial() {
    if (
      homeId == null ||
      awayId == null ||
      homeLeagueId == null ||
      awayLeagueId == null
    )
      return;
    setUnlocking(true);
    const res = await runCompare(
      homeId,
      awayId,
      homeLeagueId,
      awayLeagueId,
      true,
      europeanCup,
      () => true,
      { setLoading, setError, setResult }
    );
    setUnlocking(false);
    if (res && res.locked === false) setTrialUsed(true);
  }

  // Stav výběru drž v URL (sdílení/záložky). history.replaceState nezpůsobí
  // server re-render → žádný remount/ztráta stavu; žádný setState → lint OK.
  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    const analysis = current.get("analysis");
    if (analysis) params.set("analysis", analysis);
    params.set("mode", mode);
    if (homeLeagueId != null) params.set("homeLeague", String(homeLeagueId));
    if (awayLeagueId != null) params.set("awayLeague", String(awayLeagueId));
    if (homeId != null) params.set("home", String(homeId));
    if (awayId != null) params.set("away", String(awayId));
    if (europeanCup) params.set("context", "EURO_CUP");
    if (fixtureId != null) params.set("fixture", String(fixtureId));
    params.set("venue", venue);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [mode, homeLeagueId, awayLeagueId, homeId, awayId, europeanCup, fixtureId, venue]);

  // Klubový režim = výběr ligy, reprezentační = výběr konfederace (obojí per tým).
  const leagueLabel = mode === "CLUB" ? "Liga" : "Konfederace";

  // Typovaný výběr pro uložení do oblíbených (null, dokud nejsou oba týmy).
  const selection: Selection | null =
    homeId != null &&
    awayId != null &&
    homeLeagueId != null &&
    awayLeagueId != null
      ? {
          mode,
          homeTeamId: homeId,
          homeLeagueId,
          awayTeamId: awayId,
          awayLeagueId,
        }
      : null;

  return (
    <main className="app-page">
      <AppHeader user={user} share />

      <div className="mt-4">
        <Segmented
          options={[
            { value: "CLUB" as EntityType, label: "Kluby" },
            { value: "NATIONAL" as EntityType, label: "Reprezentace" },
          ]}
          value={mode}
          onChange={handleMode}
          ariaLabel="Typ porovnání"
        />
      </div>

      <section className="ui-panel mt-4 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <TeamSelect
            accent="home"
            heading="Domácí"
            teams={homeTeams}
            teamsError={homeTeamsError}
            value={homeId}
            exclude={awayId}
            onChange={setHomeId}
            leagueLabel={leagueLabel}
            leagues={modeLeagues}
            leagueId={homeLeagueId}
            onLeagueChange={handleHomeLeague}
          />
          <button
            type="button"
            onClick={handleSwap}
            title="Prohodit domácí a hostující tým"
            aria-label="Prohodit domácí a hostující tým"
            className="ui-control order-3 grid min-w-11 place-items-center px-3 text-muted transition hover:border-accent-strong/40 hover:text-foreground md:order-none"
          >
            ⇄
          </button>
          <TeamSelect
            accent="away"
            heading="Host"
            teams={awayTeams}
            teamsError={awayTeamsError}
            value={awayId}
            exclude={homeId}
            onChange={setAwayId}
            leagueLabel={leagueLabel}
            leagues={modeLeagues}
            leagueId={awayLeagueId}
            onLeagueChange={handleAwayLeague}
          />
        </div>
      </section>

      {(homeId != null || awayId != null) && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            title="Vymazat výběr a začít nové porovnání"
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition hover:text-foreground"
          >
            ✕ Nové porovnání
          </button>
        </div>
      )}

      {isPro && (
        <FavoritesSection
          selection={selection}
          result={result}
          onApply={applyFavorite}
        />
      )}

      {savedView && result && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
          <span>📌 Zobrazeno z uložené verze ({savedView}).</span>
          <button
            type="button"
            onClick={refreshCurrent}
            className="rounded-full border border-border px-2.5 py-1 font-medium text-foreground transition hover:bg-background"
          >
            ↻ Aktualizovat
          </button>
        </div>
      )}

      <ResultPanel
        key={`${homeId ?? 0}-${awayId ?? 0}`}
        result={result}
        venue={venue}
        onVenueChange={setVenue}
        initialViewMode={initial?.analysis}
        loading={loading}
        error={error}
        ready={canCompare}
        onRetry={refreshCurrent}
        homeInjuries={homeInjuries}
        awayInjuries={awayInjuries}
        injuriesFailed={homeInjuriesFailed || awayInjuriesFailed}
        homeStanding={homeStanding}
        awayStanding={awayStanding}
        homeScorers={homeScorers}
        awayScorers={awayScorers}
        homeLeagueAvg={homeLeagueAvg}
        homeLeagueId={homeLeagueId}
        awayLeagueId={awayLeagueId}
        europeanCup={europeanCup}
        fixtureId={fixtureId}
        user={user}
        trialAvailable={trialAvailable}
        unlocking={unlocking}
        onUnlockTrial={handleUnlockTrial}
      />
    </main>
  );
}


type ViewMode = "raw" | "category" | "style";

function ResultPanel({
  result,
  venue,
  onVenueChange,
  initialViewMode,
  loading,
  error,
  ready,
  onRetry,
  homeInjuries,
  awayInjuries,
  injuriesFailed,
  homeStanding,
  awayStanding,
  homeScorers,
  awayScorers,
  homeLeagueAvg,
  homeLeagueId,
  awayLeagueId,
  europeanCup,
  fixtureId,
  user,
  trialAvailable,
  unlocking,
  onUnlockTrial,
}: {
  result: CompareResult | null;
  venue: Venue;
  onVenueChange: (venue: Venue) => void;
  initialViewMode?: ViewMode;
  loading: boolean;
  error: string | null;
  ready: boolean;
  onRetry: () => void;
  homeInjuries: Injury[];
  awayInjuries: Injury[];
  injuriesFailed: boolean;
  homeStanding: Standing | null;
  awayStanding: Standing | null;
  homeScorers: Scorer[];
  awayScorers: Scorer[];
  homeLeagueAvg: LeagueGoalsAvg | null;
  homeLeagueId: number | null;
  awayLeagueId: number | null;
  europeanCup: boolean;
  fixtureId: number | null;
  user: SessionUser | null;
  trialAvailable: boolean;
  unlocking: boolean;
  onUnlockTrial: () => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode ?? "category");
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("analysis", viewMode);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [viewMode]);
  useEffect(() => {
    if (!result || window.location.hash !== "#vysledek-analyzy") return;
    requestAnimationFrame(() => document.getElementById("vysledek-analyzy")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [result]);
  const entityMode: EntityType =
    result?.source === "NATIONAL" || result?.source === "NATIONAL_FB" ? "NATIONAL" : "CLUB";
  // Ligová tabulka jen pro klub vs. klub stejné ligy (FREE, i pro zamčený výsledek).
  const sameLeague =
    entityMode === "CLUB" && !europeanCup && homeLeagueId != null && homeLeagueId === awayLeagueId;
  const leagueTable = useLeagueTable(
    sameLeague ? homeLeagueId : null,
    sameLeague && result != null
  );
  const categoryScores = useMemo(
    () =>
      result
        ? computeCategoryScores(result.home.values, result.away.values, venue, entityMode)
        : [],
    [result, venue, entityMode]
  );
  const styleDimensions = useMemo(
    () => (result ? computePlayStyle(result.home.values, result.away.values, venue) : []),
    [result, venue]
  );

  if (error) {
    return (
      <Empty>
        <p>{error}</p>
        {ready && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground transition hover:bg-background"
          >
            ↻ Zkusit znovu
          </button>
        )}
      </Empty>
    );
  }
  if (!ready) {
    return <Empty>Vyber domácí a hostující tým pro porovnání.</Empty>;
  }
  if (loading && !result) {
    return <Skeleton />;
  }
  if (!result) return null;

  const valueFor = (teamSide: "home" | "away", metric: Metric) =>
    result[teamSide].values.find(
      (v) => v.metric === metric && v.venue === venue
    ) ?? null;

  const summaryFor = (teamSide: "home" | "away") =>
    result[teamSide].summary.find((s) => s.venue === venue) ?? null;

  // `formQuality` chybí u snímků uložených před jejím zavedením (`SavedComparison.snapshot`).
  const qualityFor = (teamSide: "home" | "away") =>
    result[teamSide].formQuality?.find((q) => q.venue === venue) ?? null;

  return (
    <div
      key={`${result.home.team.id}-${result.away.team.id}`}
      // Refetch nad už vykresleným výsledkem: čísla na obrazovce patří PŘEDCHOZÍMU
      // porovnání, dokud nedorazí nové. Bez odlišení to vypadá, že vybraný tým má
      // hodnoty toho původního – tichá, ale docela zásadní lež.
      aria-busy={loading || undefined}
      className={`fade-in mt-3 space-y-4 transition-opacity ${
        loading ? "pointer-events-none opacity-40" : ""
      }`}
    >
      {loading && (
        <p className="text-center text-xs text-muted" role="status">
          Načítám nové porovnání…
        </p>
      )}
      {result.sourceNote && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
          ⚠ {result.sourceNote}
        </div>
      )}
      {result.sourceMix && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
          <span className="font-semibold text-foreground">Skladba analýzy</span>
          <span>Evropský kontext {Math.round(result.sourceMix.euroWeight * 100)} %</span>
          <span>Domácí soutěže {100 - Math.round(result.sourceMix.euroWeight * 100)} %</span>
          <span title="Aktuální + poloviční váha předchozí evropské sezony">
            Efektivní pohárový vzorek {result.sourceMix.effectiveEuroSample.toFixed(1)} zápasu
          </span>
          <span className="basis-full text-[11px]">
            Pohárová data: {result.home.team.name} {result.sourceMix.home.current} letos + {result.sourceMix.home.previous} loni;
            {" "}{result.away.team.name} {result.sourceMix.away.current} letos + {result.sourceMix.away.previous} loni.
          </span>
        </div>
      )}

      <ComparisonSectionNav />

      {result.locked ? (
        <section id="vysledek-analyzy" className="scroll-mt-20">
          <ProLock
            user={user}
            trialAvailable={trialAvailable}
            onUnlockTrial={onUnlockTrial}
            unlocking={unlocking}
          />
        </section>
      ) : (
        <section id="vysledek-analyzy" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <p className="page-kicker">Výsledek analýzy</p>
              <h2 className="mt-1 text-lg font-bold text-foreground">
                {result.home.team.name} vs. {result.away.team.name}
              </h2>
            </div>
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
              {VENUE_LABELS[venue]}
            </span>
          </div>
          <div className="space-y-4">
          {result.insightReport && (
            <MatchVerdict verdict={result.insightReport.verdict} embedded />
          )}
          {result.prediction && (
            <div className="border-t border-border pt-4">
              <MatchPrediction
                prediction={result.prediction}
                homeName={result.home.team.name}
                awayName={result.away.team.name}
                embedded
              />
              {fixtureId != null && (
                <div className="mt-3">
                  <FixtureModelCard fixtureId={fixtureId} countsOnly />
                </div>
              )}
            </div>
          )}
          {result.insightReport && (
            <div className="border-t border-border pt-4">
              <KeySignals
                signals={result.insightReport.keySignals}
                homeTeam={{ name: result.home.team.name, logoUrl: result.home.team.logoUrl }}
                awayTeam={{ name: result.away.team.name, logoUrl: result.away.team.logoUrl }}
                embedded
              />
            </div>
          )}
          </div>
        </section>
      )}

      <section id="analyza-tymu" aria-labelledby="comparison-analysis-heading" className="scroll-mt-20 space-y-3">
        <div>
          <p className="page-kicker">Srovnání týmů</p>
          <h2 id="comparison-analysis-heading" className="mt-1 text-lg font-bold text-foreground">
            Jak si týmy vedou
          </h2>
        </div>
        <div className={`grid gap-2 ${entityMode === "CLUB" ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.55fr)]" : ""}`}>
          <Segmented
            options={[
              { value: "category" as ViewMode, label: "Kategorie" },
              { value: "style" as ViewMode, label: "Styl hry" },
              { value: "raw" as ViewMode, label: "Detailní statistiky" },
            ]}
            value={viewMode}
            onChange={setViewMode}
            ariaLabel="Pohled na statistiky"
          />
          {entityMode === "CLUB" && (
            <Segmented
              options={(["HOME", "AWAY", "TOTAL"] as Venue[]).map((value) => ({ value, label: VENUE_LABELS[value] }))}
              value={venue}
              onChange={onVenueChange}
              ariaLabel="Prostředí statistik: doma, venku nebo celkově"
            />
          )}
        </div>

      {viewMode === "raw" && (
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <TeamHeading
              name={result.home.team.name}
              logo={result.home.team.logoUrl}
              accent="home"
              href={homeLeagueId == null ? undefined : `/tym/${result.home.team.id}?league=${homeLeagueId}`}
            />
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {VENUE_LABELS[venue]}
            </span>
            <TeamHeading
              name={result.away.team.name}
              logo={result.away.team.logoUrl}
              accent="away"
              href={awayLeagueId == null ? undefined : `/tym/${result.away.team.id}?league=${awayLeagueId}`}
              alignRight
            />
          </div>
          <div className="divide-y divide-border">
            {result.metrics.map((metric) => (
              <MetricRow
                key={metric}
                label={METRIC_LABELS[metric]}
                hint={METRIC_HINTS[metric]}
                home={valueFor("home", metric)}
                away={valueFor("away", metric)}
                lowerIsBetter={LOWER_IS_BETTER.has(metric)}
              />
            ))}
          </div>
        </section>
      )}

      {viewMode === "category" && (
        <CategoryScores
          scores={categoryScores}
          homeName={result.home.team.name}
          awayName={result.away.team.name}
          homeLogo={result.home.team.logoUrl}
          awayLogo={result.away.team.logoUrl}
          leagueAvg={homeLeagueAvg}
        />
      )}

      {viewMode === "style" && (
        <PlayStyleChart
          dimensions={styleDimensions}
          homeName={result.home.team.name}
          awayName={result.away.team.name}
          homeLogo={result.home.team.logoUrl}
          awayLogo={result.away.team.logoUrl}
        />
      )}
      </section>

      {result.headToHead && (
        <HeadToHeadCard
          summary={result.headToHead}
          teamAName={result.home.team.name}
          teamBName={result.away.team.name}
        />
      )}

      {result.tactics && (result.tactics.home.sampleSize > 0 || result.tactics.away.sampleSize > 0) && (
        <TacticalComparison
          home={result.tactics.home}
          away={result.tactics.away}
          homeTeam={result.home.team}
          awayTeam={result.away.team}
        />
      )}

      <section id="forma-tymu" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div className="mb-4">
          <p className="page-kicker">Kontext zápasu</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">Forma a postavení</h2>
        </div>
        <div className="space-y-4">
          <FormSummary
            home={summaryFor("home")}
            away={summaryFor("away")}
            homeQuality={qualityFor("home")}
            awayQuality={qualityFor("away")}
            homeTeam={result.home.team}
            awayTeam={result.away.team}
            homeStanding={homeStanding}
            awayStanding={awayStanding}
            leagueTable={sameLeague ? leagueTable : null}
            prediction={result.prediction ?? null}
            venue={venue}
            mode={entityMode}
            homeLeagueId={homeLeagueId}
            awayLeagueId={awayLeagueId}
            embedded
          />
          {(homeStanding || awayStanding) && (
            <div className="border-t border-border pt-4">
              <StandingContext home={homeStanding} away={awayStanding} venue={venue} embedded />
            </div>
          )}
        </div>
      </section>

      <section id="dalsi-informace" aria-labelledby="comparison-more-heading" className="scroll-mt-20 space-y-2">
        <div className="mb-3">
          <p className="page-kicker">Podrobnosti</p>
          <h2 id="comparison-more-heading" className="mt-1 text-lg font-bold text-foreground">
            Další informace
          </h2>
        </div>

        {leagueTable && leagueTable.rows.some((r) => r.played > 0) && (
          <LeagueTableSection
            table={leagueTable}
            leagueId={homeLeagueId!}
            highlightTeamIds={new Set([result.home.team.id, result.away.team.id])}
          />
        )}

        {(homeScorers.length > 0 || awayScorers.length > 0) && (
          <DetailAccordion
            title="Nejlepší střelci"
            summary={<>{homeScorers.length + awayScorers.length} hráčů</>}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {homeScorers.length > 0 && (
                <ScorerList title={result.home.team.name} accent="home" scorers={homeScorers} />
              )}
              {awayScorers.length > 0 && (
                <ScorerList title={result.away.team.name} accent="away" scorers={awayScorers} />
              )}
            </div>
          </DetailAccordion>
        )}

        {(injuriesFailed || homeInjuries.length > 0 || awayInjuries.length > 0) && (
          <DetailAccordion
            title="Absence"
            summary={
              <>
                {result.home.team.name} {homeInjuries.length} · {result.away.team.name} {awayInjuries.length}
              </>
            }
          >
            {injuriesFailed && (
              <p className="mb-3 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
                Přehled zranění se nepodařilo načíst – neznamená to, že jsou oba kádry kompletní.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {homeInjuries.length > 0 && (
                <InjuryList title={result.home.team.name} accent="home" injuries={homeInjuries} />
              )}
              {awayInjuries.length > 0 && (
                <InjuryList title={result.away.team.name} accent="away" injuries={awayInjuries} />
              )}
            </div>
          </DetailAccordion>
        )}

        {!result.locked && result.insightReport && (
          <DetailAccordion title="Rozšířené týmové signály">
            <div className="grid gap-3 sm:grid-cols-2">
              <InsightChips
                title={result.home.team.name}
                accent="home"
                insights={result.insightReport.home}
              />
              <InsightChips
                title={result.away.team.name}
                accent="away"
                insights={result.insightReport.away}
              />
            </div>
          </DetailAccordion>
        )}
      </section>
    </div>
  );
}

function TeamSelect({
  accent,
  heading,
  teams,
  teamsError,
  value,
  exclude,
  onChange,
  leagueLabel,
  leagues,
  leagueId,
  onLeagueChange,
}: {
  accent: "home" | "away";
  heading: string;
  teams: TeamLite[];
  teamsError?: boolean;
  value: number | null;
  exclude: number | null;
  onChange: (id: number) => void;
  leagueLabel: string;
  leagues: League[];
  leagueId: number | null;
  onLeagueChange: (id: number) => void;
}) {
  const ring = accent === "home" ? "text-home" : "text-away";
  return (
    <div className={`min-w-0 rounded-xl border bg-background/60 p-4 ${accent === "home" ? "border-home/25" : "border-away/25"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${ring}`}>
        {heading}
      </p>
      <label className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-muted">
        {leagueLabel}
      </label>
      <select
        className="ui-control mt-1 w-full px-3 text-base outline-none transition focus:border-accent-strong"
        value={leagueId ?? ""}
        onChange={(e) => onLeagueChange(Number(e.target.value))}
      >
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {leagueDisplayName(l)}
          </option>
        ))}
      </select>
      <div className="mt-2">
        <TeamCombobox
          teams={teams}
          value={value}
          exclude={exclude}
          onChange={onChange}
          accent={accent}
        />
        {teamsError && (
          <p className="mt-1 text-[11px] text-warning">
            Týmy se nepodařilo načíst. Zkus přepnout ligu/konfederaci znovu.
          </p>
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
  ariaLabel?: string;
}) {
  // Šipkami posouvej výběr (vzor radiogroup s roving tabindexem).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % options.length
        : (i - 1 + options.length) % options.length;
    onChange(options[next].value);
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`inline-flex w-full rounded-xl border border-border bg-surface p-1 shadow-sm ${
        compact ? "w-auto" : ""
      }`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`min-h-10 flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "bg-accent/35 text-foreground ring-1 ring-accent-strong/20"
                : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DetailAccordion({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-accent/5"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="ml-auto text-xs text-muted">{summary}</span>
        <span
          className={"text-muted transition-transform " + (open ? "rotate-180" : "")}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && <div className="border-t border-border px-3 py-4 sm:px-4">{children}</div>}
    </section>
  );
}

function TacticalComparison({ home, away, homeTeam, awayTeam }: {
  home: TacticalProfile;
  away: TacticalProfile;
  homeTeam: { name: string; logoUrl: string };
  awayTeam: { name: string; logoUrl: string };
}) {
  const line = (profile: TacticalProfile) => profile.defensiveLine === "BACK_THREE"
    ? "častěji tříčlenná obrana"
    : profile.defensiveLine === "BACK_FOUR"
      ? "častěji čtyřčlenná obrana"
      : profile.defensiveLine === "MIXED" ? "střídá obranné systémy" : "bez určeného systému";
  return <section className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6" aria-labelledby="tactical-comparison-title">
    <div className="mb-4"><p className="page-kicker">Taktický kontext</p><h2 id="tactical-comparison-title" className="mt-1 text-lg font-bold text-foreground">Rozestavení a trenéři</h2><p className="mt-1 text-xs text-muted">Oficiální výchozí sestavy z posledních zápasů; nejde o odhad pozice týmu během celého utkání.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {([[home, homeTeam, "home"], [away, awayTeam, "away"]] as const).map(([profile, team, accent]) => <article key={accent} className="rounded-xl border border-border bg-background p-4">
        <TeamHeading name={team.name} logo={team.logoUrl} accent={accent} />
        {profile.sampleSize ? <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <TacticalMetric label="Nejčastěji" value={profile.primaryFormation ?? "—"} />
            <TacticalMetric label="Stabilita" value={profile.stability == null ? "—" : `${Math.round(profile.stability * 100)} %`} />
            <TacticalMetric label="Vzorek" value={`${profile.sampleSize}`} />
          </div>
          <p className="mt-3 text-sm text-foreground"><b>{line(profile)}</b>{profile.recentChange ? " · systém se v posledních utkáních změnil" : ""}</p>
          <p className="mt-1 text-xs text-muted">Doma {profile.homeFormation ?? "—"} · venku {profile.awayFormation ?? "—"}</p>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">Trenér: <b className="text-foreground">{profile.coach?.name ?? "není dostupný"}</b>{profile.coach ? ` · ${profile.coach.matchesInSample}/${profile.sampleSize} zápasů vzorku` : ""}</p>
        </> : <p className="mt-4 text-sm text-muted">Oficiální sestavy zatím nejsou v cache dostupné.</p>}
      </article>)}
    </div>
  </section>;
}

function TacticalMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wide text-muted">{label}</p><p className="mt-1 font-bold tabular-nums text-foreground">{value}</p></div>;
}

function ComparisonSectionNav() {
  const items = [
    { href: "#vysledek-analyzy", label: "Výsledek" },
    { href: "#analyza-tymu", label: "Analýza" },
    { href: "#forma-tymu", label: "Forma" },
    { href: "#dalsi-informace", label: "Podrobnosti" },
  ];
  return (
    <nav aria-label="Obsah porovnání" className="sticky top-2 z-20 -mx-1 overflow-x-auto rounded-xl border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
      <div className="flex min-w-max gap-1">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-muted outline-none transition hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-strong"
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** Collapsible ligová tabulka v Porovnání (default sbalená; oba týmy zvýrazněné). */
function LeagueTableSection({
  table,
  highlightTeamIds,
  leagueId,
}: {
  table: LeagueTable;
  highlightTeamIds: Set<number>;
  leagueId: number;
}) {
  return (
    <DetailAccordion title="Ligová tabulka">
      <StandingsTable rows={table.rows} highlightTeamIds={highlightTeamIds} leagueId={leagueId} />
      <ZoneLegend rows={table.rows} />
    </DetailAccordion>
  );
}

/** Porovnání má vlastní vertikální rytmus (`mt-3`), jinak sdílí vzhled s ostatními. */
function Empty({ children }: { children: React.ReactNode }) {
  return <SharedEmpty className="mt-3">{children}</SharedEmpty>;
}

function Skeleton() {
  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-border bg-surface p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-border/60"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}
