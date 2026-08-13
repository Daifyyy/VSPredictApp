"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";
import { TeamLogo } from "./TeamLogo";
import { StandingsTable, ZoneLegend } from "./StandingsTable";
import { LeagueScorerList } from "./LeagueScorerList";
import { buildCompareHref } from "./compareHref";
import { CLUB_LEAGUES, leagueDisplayName } from "@/lib/data/catalog";
import type { LeagueRound, LeagueScorer, LeagueStyleKey, LeagueStyleSnapshot, LeagueTable, RoundFixture, Venue } from "@/lib/types";
import { useCurrentUser } from "./useCurrentUser";
import { leagueRowsForVenue } from "@/lib/leagueTable";
import { LEAGUE_STYLE_KEYS, LEAGUE_STYLE_META } from "@/lib/stats/leagueStyle";

const DEFAULT_LEAGUE = 39; // Premier League
const STORAGE_KEY = "tabulky:league";

type Status = "loading" | "ok" | "error";

// Mimo komponentu (vzor DigestApp/PicksApp): žádné synchronní setState přímo v efektu.
async function loadTable(
  leagueId: number,
  isActive: () => boolean,
  setTable: (t: LeagueTable | null) => void,
  setStatus: (s: Status) => void
): Promise<void> {
  setStatus("loading");
  setTable(null);
  try {
    const r = await fetch(`/api/standings/table?league=${leagueId}`);
    if (!r.ok) throw new Error("http");
    const d: { table: LeagueTable | null } = await r.json();
    if (!isActive()) return;
    setTable(d.table);
    setStatus("ok");
  } catch {
    if (isActive()) setStatus("error");
  }
}

async function loadStyle(
  leagueId: number,
  pro: boolean,
  isActive: () => boolean,
  setSnapshot: (snapshot: LeagueStyleSnapshot | null) => void,
  setStatus: (status: Status) => void
): Promise<void> {
  setStatus("loading");
  setSnapshot(null);
  try {
    const endpoint = pro ? "/api/standings/style/full" : "/api/standings/style";
    const response = await fetch(`${endpoint}?league=${leagueId}`);
    if (!response.ok) throw new Error("http");
    const data = await response.json() as { snapshot: LeagueStyleSnapshot | null };
    if (!isActive()) return;
    setSnapshot(data.snapshot);
    setStatus("ok");
  } catch {
    if (isActive()) setStatus("error");
  }
}

/**
 * Poslední odehrané + nejbližší nadcházející zápasy (odděleně od tabulky – jiné TTL, jiná
 * routa). Pozor: API nemá dotaz „celé kolo", jen skupinu zápasů dogroupovanou podle data
 * (`pickRound`) – u rozehraného kola (rozloženého např. pá–po) proto může „poslední" sekce
 * ukázat jen část zápasů, zbytek téhož kola padne do „nejbližší". Proto zobrazovací popisky
 * v UI mluví o „zápasech", ne o „kole" – neslibují úplnost.
 */
async function loadRound(
  leagueId: number,
  isActive: () => boolean,
  setRound: (r: LeagueRound | null) => void,
  setStatus: (s: Status) => void
): Promise<void> {
  setRound(null);
  setStatus("loading");
  try {
    const r = await fetch(`/api/standings/round?league=${leagueId}`);
    if (!r.ok) throw new Error("http");
    const d: { round: LeagueRound | null } = await r.json();
    if (!isActive()) return;
    setRound(d.round);
    setStatus("ok");
  } catch {
    // Sekce se nevykreslí, ale layout se pod tím nesmí propadnout bez vysvětlení.
    if (isActive()) setStatus("error");
  }
}

/** Nejlepší střelci + nahrávači ligy. */
async function loadScorers(
  leagueId: number,
  isActive: () => boolean,
  setScorers: (s: { scorers: LeagueScorer[]; assists: LeagueScorer[] }) => void,
  setStatus: (s: Status) => void
): Promise<void> {
  setScorers({ scorers: [], assists: [] });
  setStatus("loading");
  try {
    const r = await fetch(`/api/standings/scorers?league=${leagueId}`);
    if (!r.ok) throw new Error("http");
    const d: { scorers: LeagueScorer[]; assists: LeagueScorer[] } = await r.json();
    if (!isActive()) return;
    setScorers(d);
    setStatus("ok");
  } catch {
    if (isActive()) setStatus("error");
  }
}

/** Obnoví poslední zvolenou ligu z localStorage (mimo tělo efektu → lint-clean). */
function restoreLeague(apply: (id: number) => void): void {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && CLUB_LEAGUES.some((l) => l.id === saved)) apply(saved);
  } catch {
    // localStorage nemusí být dostupný (privátní režim) – nevadí
  }
}

/**
 * Záložka Tabulky (FREE): celá aktuální ligová tabulka vybrané klubové ligy. Data se
 * tahají líně z `/api/standings/table` (sdílí `standings:` cache → levné) při přepnutí
 * ligy. Mobile-first: úzké obrazovky skryjí rozšířené sloupce (V-R-P, forma), nescrolluje
 * se vodorovně celá stránka. Poslední zvolená liga se pamatuje v `localStorage`.
 */
export function TabulkyApp() {
  const user = useCurrentUser();
  const [restored, setRestored] = useState(false);
  const [leagueId, setLeagueId] = useState(DEFAULT_LEAGUE);
  const [venue, setVenue] = useState<Venue>("TOTAL");
  const [styleKey, setStyleKey] = useState<LeagueStyleKey>("possession");
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [round, setRound] = useState<LeagueRound | null>(null);
  const [roundStatus, setRoundStatus] = useState<Status>("loading");
  const [scorers, setScorers] = useState<{ scorers: LeagueScorer[]; assists: LeagueScorer[] }>({
    scorers: [],
    assists: [],
  });
  const [scorersStatus, setScorersStatus] = useState<Status>("loading");
  const [styleSnapshot, setStyleSnapshot] = useState<LeagueStyleSnapshot | null>(null);
  const [styleStatus, setStyleStatus] = useState<Status>("loading");

  // Po mountu obnov poslední zvolenou ligu (bez SSR hydration mismatchu).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedLeague = Number(params.get("league"));
    const requestedVenue = params.get("venue");
    const requestedMetric = params.get("metric") as LeagueStyleKey | null;
    queueMicrotask(() => {
      if (CLUB_LEAGUES.some((league) => league.id === requestedLeague)) setLeagueId(requestedLeague);
      else restoreLeague(setLeagueId);
      if (requestedVenue === "TOTAL" || requestedVenue === "HOME" || requestedVenue === "AWAY") setVenue(requestedVenue);
      if (["possession", "buildup", "pressing", "efficiency", "defense"].includes(requestedMetric ?? "")) setStyleKey(requestedMetric!);
      setRestored(true);
    });
  }, []);

  useEffect(() => {
    if (!restored) return;
    let active = true;
    void loadTable(leagueId, () => active, setTable, setStatus);
    void loadRound(leagueId, () => active, setRound, setRoundStatus);
    void loadScorers(leagueId, () => active, setScorers, setScorersStatus);
    return () => {
      active = false;
    };
  }, [leagueId, restored]);

  useEffect(() => {
    if (!restored) return;
    let active = true;
    void loadStyle(leagueId, user?.tier === "PRO", () => active, setStyleSnapshot, setStyleStatus);
    return () => { active = false; };
  }, [leagueId, user?.tier, restored]);

  useEffect(() => {
    if (!restored) return;
    const url = new URL(window.location.href);
    url.searchParams.set("league", String(leagueId));
    url.searchParams.set("venue", venue);
    url.searchParams.set("metric", styleKey);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [leagueId, venue, styleKey, restored]);

  function select(id: number) {
    setLeagueId(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // localStorage nemusí být dostupný (privátní režim) – nevadí
    }
  }

  const league = CLUB_LEAGUES.find((l) => l.id === leagueId);
  const totalRows = table?.rows ?? [];
  const rows = leagueRowsForVenue(totalRows, venue);
  // Předsezóna: API vrací týmy, ale všechny s 0 odehranými (tabulka samých nul) →
  // ber to jako prázdný stav (informativní hláška místo bezcenné tabulky).
  const hasPlayed = totalRows.some((r) => r.played > 0);

  return (
    <main className="app-page">
      <AppHeader user={user} />

      <h1>Ligové tabulky</h1>
      <p className="mt-1 text-sm text-muted">
        Aktuální pořadí vybrané ligy – pozice, body, skóre a forma.
      </p>

      <LeagueToolbar selected={leagueId} venue={venue} onSelect={select} onVenue={setVenue} />

      <section className="mt-4">
        {status === "loading" ? (
          <TableSkeleton />
        ) : status === "error" ? (
          <Note>Tabulku se nepodařilo načíst. Zkus to prosím za chvíli znovu.</Note>
        ) : !hasPlayed ? (
          <Note>
            {league ? leagueDisplayName(league) : "Tato liga"} zatím nemá odehrané zápasy (mezisezóna) nebo pro
            ni nejsou dostupná data. Zkus jinou ligu.
          </Note>
        ) : (
          <>
            <StandingsTable rows={rows} leagueId={leagueId} />
            {table?.leagueAvg && (
              <p className="mt-2 text-xs text-muted">
                ⌀ tým v lize vstřelí {table.leagueAvg.goalsFor.toFixed(2)} gólu na zápas
                (v celém utkání tedy zhruba{" "}
                {(table.leagueAvg.goalsFor * 2).toFixed(2)} gólu)
              </p>
            )}
            {venue === "TOTAL" ? <ZoneLegend rows={rows} /> : (
              <p className="mt-2 text-xs text-muted">Dílčí pořadí podle bodů získaných {venue === "HOME" ? "doma" : "venku"}; nejde o oficiální tabulku ligy.</p>
            )}
          </>
        )}
      </section>

      <LeagueStyleSection
        snapshot={styleSnapshot}
        status={styleStatus}
        venue={venue}
        selected={styleKey}
        onSelect={setStyleKey}
        isPro={user?.tier === "PRO"}
        leagueId={leagueId}
      />

      {/* Obě podsekce se dotahují samostatně, proto mají vlastní stav. Dřív se jen tiše
          objevily o pár vteřin později a posunuly obsah pod sebou. */}
      {hasPlayed && (
        <section className="mt-6 space-y-4">
          {roundStatus === "loading" ? (
            <CardsSkeleton />
          ) : roundStatus === "error" ? (
            <Note>Zápasy kola se nepodařilo načíst.</Note>
          ) : (
            round &&
            (round.last.length > 0 || round.next.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {round.last.length > 0 && (
                  <RoundList
                    title="Poslední odehrané zápasy"
                    leagueId={leagueId}
                    fixtures={round.last}
                  />
                )}
                {round.next.length > 0 && (
                  <RoundList
                    title="Nejbližší zápasy"
                    leagueId={leagueId}
                    fixtures={round.next}
                  />
                )}
              </div>
            )
          )}

          {scorersStatus === "loading" ? (
            <CardsSkeleton />
          ) : scorersStatus === "error" ? (
            <Note>Střelce se nepodařilo načíst.</Note>
          ) : (
            (scorers.scorers.length > 0 || scorers.assists.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <LeagueScorerList
                  title="Nejlepší střelci"
                  unit="gólů"
                  players={scorers.scorers}
                />
                <LeagueScorerList
                  title="Nejlepší nahrávky"
                  unit="asistencí"
                  players={scorers.assists}
                />
              </div>
            )
          )}
        </section>
      )}
    </main>
  );
}

function RoundList({
  title,
  leagueId,
  fixtures,
}: {
  title: string;
  leagueId: number;
  fixtures: RoundFixture[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
      <ul className="space-y-1.5 text-xs">
        {fixtures.map((f) => {
          const href = buildCompareHref({
            compareMode: "CLUB",
            home: { id: f.home.id },
            away: { id: f.away.id },
            homeCompareLeagueId: leagueId,
            awayCompareLeagueId: leagueId,
          });
          const played = f.homeGoals != null && f.awayGoals != null;
          const inner = (
            <div className="flex items-center gap-1.5">
              <TeamLogo src={f.home.logoUrl} alt={f.home.name} size={16} />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {f.home.name}
              </span>
              {played ? (
                <span className="shrink-0 font-bold tabular-nums text-foreground">
                  {f.homeGoals}:{f.awayGoals}
                </span>
              ) : (
                <span className="shrink-0 text-muted">
                  {new Date(f.kickoff).toLocaleDateString("cs-CZ", {
                    day: "numeric",
                    month: "numeric",
                  })}
                </span>
              )}
              <TeamLogo src={f.away.logoUrl} alt={f.away.name} size={16} />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {f.away.name}
              </span>
            </div>
          );
          return (
            <li key={f.fixtureId}>
              {href ? (
                <Link href={href} className="block rounded transition hover:bg-background">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LeagueToolbar({ selected, venue, onSelect, onVenue }: {
  selected: number; venue: Venue; onSelect: (id: number) => void; onVenue: (venue: Venue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedLeague = CLUB_LEAGUES.find((league) => league.id === selected)!;
  const needle = query.trim().toLocaleLowerCase("cs");
  const filtered = CLUB_LEAGUES.filter((league) => `${leagueDisplayName(league)} ${league.country}`.toLocaleLowerCase("cs").includes(needle));
  return <div className="sticky top-0 z-20 mt-5 rounded-xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="ui-control flex min-w-0 items-center gap-2 px-3 text-left font-semibold text-foreground hover:border-positive/40">
        <TeamLogo src={selectedLeague.logoUrl} alt={selectedLeague.name} size={24} /><span className="min-w-0 flex-1 truncate">{leagueDisplayName(selectedLeague)}</span><span aria-hidden className="text-muted">⌄</span>
      </button>
      <div className="grid grid-cols-3 rounded-lg border border-border bg-surface p-1" aria-label="Místo výkonu">
        {(["TOTAL", "HOME", "AWAY"] as Venue[]).map((item) => <button key={item} type="button" onClick={() => onVenue(item)} aria-pressed={venue === item} className={`min-h-9 rounded-md px-3 text-sm font-semibold ${venue === item ? "bg-accent/40 text-foreground" : "text-muted hover:text-foreground"}`}>{item === "TOTAL" ? "Celkem" : item === "HOME" ? "Doma" : "Venku"}</button>)}
      </div>
    </div>
    {open ? <div className="fixed inset-0 z-[80] grid place-items-center bg-foreground/20 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Vybrat ligu" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setQuery(""); } }}>
      <div className="flex max-h-[min(42rem,90vh)] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface p-3 shadow-xl">
        <div className="flex items-center gap-2"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Vyhledat ligu…" aria-label="Vyhledat ligu" className="ui-control min-w-0 flex-1 px-3 text-sm outline-none focus:border-positive" /><button type="button" onClick={() => { setOpen(false); setQuery(""); }} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted">Zavřít</button></div>
        <div className="mt-2 overflow-y-auto" role="listbox" aria-label="Ligy">
          {filtered.map((league) => <button key={league.id} type="button" role="option" aria-selected={league.id === selected} onClick={() => { onSelect(league.id); setOpen(false); setQuery(""); }} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left ${league.id === selected ? "bg-accent/25" : "hover:bg-background"}`}><TeamLogo src={league.logoUrl} alt={league.name} size={26} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{leagueDisplayName(league)}</span><span className="block text-xs text-muted">{league.country}</span></span></button>)}
          {filtered.length === 0 ? <p className="p-4 text-sm text-muted">Žádná liga nebyla nalezena.</p> : null}
        </div>
      </div>
    </div> : null}
  </div>;
}

function LeagueStyleSection({ snapshot, status, venue, selected, onSelect, isPro, leagueId }: { snapshot: LeagueStyleSnapshot | null; status: Status; venue: Venue; selected: LeagueStyleKey; onSelect: (key: LeagueStyleKey) => void; isPro: boolean; leagueId: number; }) {
  if (status === "loading") return <section className="mt-8"><CardsSkeleton /></section>;
  if (!snapshot) return <section className="mt-8"><Note>{status === "error" ? "Herní žebříčky se nepodařilo načíst." : "Žebříček připravujeme. Návštěva stránky nespouští žádné placené API volání."}</Note></section>;
  const current = snapshot.rankings[venue][selected];
  const coverage = snapshot.coverage[venue];
  const updated = new Date(snapshot.updatedAt).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  return <section className="mt-8" aria-labelledby="league-style-title">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="league-style-title" className="text-xl font-bold text-foreground">Herní profil ligy</h2><p className="mt-1 text-sm text-muted">Kurátorované charakteristiky, ne surový výpis statistik ani univerzální hodnocení kvality.</p></div><p className="text-xs text-muted">Aktualizováno {updated} · data pro {coverage.eligible}/{coverage.total} týmů</p></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{LEAGUE_STYLE_KEYS.map((key) => { const leader = snapshot.rankings[venue][key][0]; const meta = LEAGUE_STYLE_META[key]; return <button key={key} type="button" onClick={() => onSelect(key)} aria-pressed={selected === key} className={`data-card min-h-24 p-3 text-left ${selected === key ? "border-positive ring-2 ring-positive/10" : ""}`}><span className="block text-xs font-semibold text-muted">{meta.label}</span><span className="mt-2 flex items-center gap-2 text-sm font-bold text-foreground">{leader ? <><TeamLogo src={leader.logoUrl} alt={leader.name} size={22} /><span className="truncate">{leader.name}</span><span className="ml-auto tabular-nums text-positive">{leader.score.toFixed(1)}</span></> : "Málo dat"}</span></button>; })}</div>
    <div className="ui-panel mt-3 overflow-hidden"><div className="border-b border-border px-4 py-3"><h3 className="font-bold text-foreground">{LEAGUE_STYLE_META[selected].label}</h3><p className="mt-1 max-w-4xl text-xs leading-5 text-muted">{LEAGUE_STYLE_META[selected].note}</p><p className="mt-2 text-[11px] leading-5 text-muted">Aktuální sezona tvoří už od prvního použitelného zápasu nejméně 70 % skóre. Loňský referenční základ má pouze doplňkovou váhu, která s každým letošním zápasem klesá a od sedmi zápasů se nepoužívá.</p></div><ol className="divide-y divide-border">{current.map((entry) => {
      const hasBreakdown = entry.currentSeasonSample !== undefined && entry.baselineSample !== undefined;
      const currentWeight = Math.round((entry.currentSeasonWeight ?? 0) * 100);
      const sampleLabel = hasBreakdown
        ? entry.currentSeasonSample
          ? `${entry.currentSeasonSample} letos (${currentWeight} %)${entry.baselineSample ? ` + ${entry.baselineSample} základ (${100 - currentWeight} %)` : ""}`
          : `${entry.baselineSample} základ (100 %)`
        : `${entry.sampleSize} zápasů`;
      return <li key={entry.teamId} className="grid min-h-14 grid-cols-[2rem_1fr_auto] items-center gap-2 px-4 py-2"><span className="text-center text-sm font-bold tabular-nums text-muted">{entry.rank}.</span><Link href={`/tym/${entry.teamId}?league=${leagueId}&venue=${venue}`} className="flex min-w-0 items-center gap-2 rounded hover:text-positive"><TeamLogo src={entry.logoUrl} alt={entry.name} size={26} /><span className="truncate text-sm font-semibold">{entry.name}</span></Link><span className="text-right"><span className="block font-bold tabular-nums text-foreground">{entry.score.toFixed(1)}/10</span><span className={`block text-[10px] ${entry.lowConfidence ? "text-warning" : "text-muted"}`}>{entry.lowConfidence ? `málo dat · ${sampleLabel}` : sampleLabel}</span></span></li>;
    })}</ol>{!isPro ? <div className="border-t border-border bg-background px-4 py-4 text-center text-sm text-muted">Zobrazeno Top 5. <Link href="/api/auth/signin" className="font-semibold text-positive hover:underline">Přihlásit se k PRO pro celý žebříček</Link>.</div> : null}</div>
    <p className="mt-2 text-[11px] leading-5 text-muted">„Základ“ označuje reprezentativní vzorek předchozí dokončené sezony. Přepnutí pohledu ani metriky nevolá API-Football.</p>
  </section>;
}

function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-3 shadow-sm">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-4 animate-pulse rounded bg-border" />
          <div className="h-5 w-5 animate-pulse rounded-full bg-border" />
          <div className="h-4 flex-1 animate-pulse rounded bg-border" />
          <div className="h-4 w-8 animate-pulse rounded bg-border" />
        </div>
      ))}
    </div>
  );
}

/** Dvojice karet vedle sebe (kolo / střelci) – drží výšku, než data dorazí. */
function CardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-2xl bg-border/60"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
      {children}
    </div>
  );
}
