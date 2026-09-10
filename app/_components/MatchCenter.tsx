"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UpcomingFixture } from "@/lib/types";
import type { MatchEvent } from "@/lib/stats/matchEvents";
import type { LiveProbabilities } from "@/lib/picks/liveModel";
import { TeamLogo } from "./TeamLogo";
import { EventTimeline } from "./EventTimeline";
import { buildCompareHref } from "./compareHref";
import type { SessionUser } from "./sessionUser";

type Stats = Partial<Record<"XG" | "SHOTS" | "SHOTS_ON_TARGET" | "POSSESSION" | "PASSES_TOTAL" | "CORNERS" | "FOULS" | "YELLOW_CARDS" | "RED_CARDS", number>>;
type LineupPlayer = { playerId: number | null; name: string; number: number | null; position: string | null };
type Lineup = { teamId: number; status: string; formation: string | null; coachName: string | null; capturedAt: string; completeness: number; starters: LineupPlayer[]; substitutes: LineupPlayer[] };
type Payload = {
  match: null | { observedAt: string; minute: number | null; status: string; homeGoals: number | null; awayGoals: number | null; homeTeamId: number; awayTeamId: number; venueName: string | null; homeStats: Stats | null; awayStats: Stats | null; events: MatchEvent[] | null };
  venue: null | { name: string | null; address: string | null; city: string | null; capacity: number | null; surface: string | null; imageUrl: string | null };
  model: null | { probabilities: LiveProbabilities; lowConfidence: boolean; remainingLambdaHome: number; remainingLambdaAway: number };
  odds: Array<{ id: string; observedAt: string; market: string; side: string; line: number | null; decimalOdds: number; bookmaker: string; main: boolean; blocked: boolean; stopped: boolean }>;
  candidates: Array<{ id: string; market: string; side: string; line: number | null; modelProbability: number; marketProbability: number; edge: number; expectedValue: number; decimalOdds: number; bookmaker: string; minute: number; reason: string }>;
  lineups: Lineup[];
  pro: boolean;
  updatedAt: string | null;
};

const FINAL = new Set(["FT", "AET", "PEN", "CANC", "ABD"]);
const pct = (n: number) => `${(n * 100).toFixed(0)} %`;
const optionalPct = (n: number | undefined) => n == null || !Number.isFinite(n) ? "čeká na nový snímek" : pct(n);
const stat = (value: number | undefined, suffix = "") => value == null ? "—" : `${Number.isInteger(value) ? value : value.toFixed(2)}${suffix}`;

function marketLabel(market: string, side: string, line: number | null) {
  if (market === "LIVE_1X2") return side === "HOME" ? "Domácí vyhrají" : side === "DRAW" ? "Remíza" : "Hosté vyhrají";
  if (market === "LIVE_BTTS") return `Oba skórují · ${side === "YES" ? "Ano" : "Ne"}`;
  return `${side === "OVER" ? "Over" : "Under"} ${line?.toFixed(1) ?? "—"} gólu`;
}

function useMatchCenter(fixture: UpcomingFixture | null) {
  const [state, setState] = useState<{ loading: boolean; error: boolean; payload: Payload | null }>({ loading: false, error: false, payload: null });
  const finalRef = useRef(false);
  const fixtureId = fixture?.fixtureId ?? null;
  useEffect(() => {
    if (!fixtureId) return;
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      if (document.hidden) return;
      setState((old) => ({ ...old, loading: old.payload == null, error: false }));
      try {
        const response = await fetch(`/api/match-center?fixture=${fixtureId}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json() as Payload;
        if (active) { finalRef.current = FINAL.has(payload.match?.status ?? ""); setState({ loading: false, error: false, payload }); }
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setState((old) => ({ ...old, loading: false, error: true }));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!finalRef.current) void load();
    }, 30_000);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [fixtureId]);
  return state;
}

export function MatchCenter({ fixtures, user }: { fixtures: UpcomingFixture[]; user: SessionUser | null }) {
  const [selected, setSelected] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const value = Number(new URLSearchParams(window.location.search).get("fixture"));
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  const [watching, setWatching] = useState(false);
  const fixture = fixtures.find((f) => f.fixtureId === selected) ?? null;
  const data = useMatchCenter(fixture);
  const choose = (fixtureId: number | null) => {
    setSelected(fixtureId);
    const url = new URL(window.location.href);
    if (fixtureId) url.searchParams.set("fixture", String(fixtureId)); else url.searchParams.delete("fixture");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  useEffect(() => {
    if (!selected || !user) return;
    fetch(`/api/match-center/watch?fixture=${selected}`).then((r) => r.json()).then((d: { watching?: boolean }) => setWatching(Boolean(d.watching))).catch(() => {});
  }, [selected, user]);
  const toggleWatch = async () => {
    if (!selected || !user) return;
    const next = !watching;
    const response = await fetch("/api/match-center/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId: selected, watching: next }) });
    if (response.ok) setWatching(next);
  };

  return <section id="match-center" className="mt-3 scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" aria-labelledby="match-center-title">
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div><p className="page-kicker">Živý Match Center</p><h2 id="match-center-title" className="mt-0.5 text-lg font-extrabold">Vyber právě hrané utkání</h2></div>
      <span className="rounded-full bg-negative/10 px-3 py-1.5 text-xs font-bold text-negative">● {fixtures.length} živě</span>
    </div>
    <div className="flex gap-2 overflow-x-auto px-3 py-3" role="list" aria-label="Právě hraná utkání">
      {fixtures.map((item) => <button key={item.fixtureId} type="button" onClick={() => choose(item.fixtureId)} aria-pressed={selected === item.fixtureId} className={`min-w-[220px] rounded-xl border px-3 py-2 text-left transition ${selected === item.fixtureId ? "border-accent-strong bg-accent/15" : "border-border bg-background hover:border-accent-strong/40"}`}>
        <span className="flex items-center justify-between text-[10px] text-muted"><span className="max-w-[145px] truncate">{item.leagueName}</span><b className="text-negative">{item.elapsed ?? ""}&apos;</b></span>
        <span className="mt-1 grid grid-cols-[1fr_auto] gap-x-2 text-xs"><strong className="truncate">{item.home.name}</strong><b>{item.liveHome ?? 0}</b><strong className="truncate">{item.away.name}</strong><b>{item.liveAway ?? 0}</b></span>
      </button>)}
    </div>
    {!fixture ? <div className="border-t border-border p-5 text-center"><p className="text-sm font-semibold">Detail se začne načítat až po výběru zápasu.</p><p className="mt-1 text-xs text-muted">Na pozadí se žádné detailní statistiky ani live kurzy nestahují.</p></div> : <MatchCenterDetail fixture={fixture} state={data} watching={watching} canWatch={Boolean(user)} onWatch={toggleWatch} />}
  </section>;
}

function MatchCenterDetail({ fixture, state, watching, canWatch, onWatch }: { fixture: UpcomingFixture; state: ReturnType<typeof useMatchCenter>; watching: boolean; canWatch: boolean; onWatch: () => void }) {
  const payload = state.payload;
  const match = payload?.match;
  const venue = payload?.venue;
  const home = match?.homeStats ?? {};
  const away = match?.awayStats ?? {};
  const events = match?.events ?? [];
  const newest = events.at(-1);
  const redHome = events.filter((e) => e.kind === "red" && e.teamId === fixture.home.id).length;
  const redAway = events.filter((e) => e.kind === "red" && e.teamId === fixture.away.id).length;
  const latestOdds = useMemo(() => { const rows = payload?.odds ?? []; const newestAt = rows[0]?.observedAt; return newestAt ? rows.filter((row) => row.observedAt === newestAt) : []; }, [payload?.odds]);
  const probs = payload?.model?.probabilities;
  const scenarios = useMemo(() => probs ? buildLiveScenarios(probs, latestOdds, payload?.candidates ?? [], Boolean(payload?.model?.lowConfidence), match?.minute ?? 0) : [], [probs, latestOdds, payload?.candidates, payload?.model?.lowConfidence, match?.minute]);
  const [failedVenueImage, setFailedVenueImage] = useState<string | null>(null);
  const venueImageUrl = venue?.imageUrl ?? null;
  const href = buildCompareHref(fixture);
  return <div className="border-t border-border">
    <div className="relative min-h-52 overflow-hidden bg-[#245b3d]">
      {venueImageUrl && venueImageUrl !== failedVenueImage ? <Image src={venueImageUrl} alt={venue?.name ? `Stadion ${venue.name}` : "Místo utkání"} fill sizes="(max-width: 900px) 100vw, 900px" className="object-cover object-center opacity-70" onError={() => setFailedVenueImage(venueImageUrl)} /> : <div className="absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(90deg, transparent 49.7%, rgba(255,255,255,.8) 50%, transparent 50.3%), radial-gradient(circle at center, transparent 0 16%, rgba(255,255,255,.75) 16.5% 17%, transparent 17.5%), linear-gradient(rgba(255,255,255,.55),rgba(255,255,255,.55))", backgroundSize: "100% 100%, 100% 100%, calc(100% - 48px) calc(100% - 32px)", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07140e]/95 via-[#102219]/45 to-black/20" />
      <div className="relative flex min-h-52 flex-col justify-between p-4 text-white sm:p-6">
        <div className="flex items-start justify-between gap-3 text-xs"><span>{venue?.name ?? match?.venueName ?? fixture.venueName ?? "Místo utkání není uvedeno"}{venue?.city ? ` · ${venue.city}` : ""}</span><button type="button" disabled={!canWatch} onClick={onWatch} className="rounded-full border border-white/30 bg-black/20 px-3 py-1.5 font-semibold disabled:opacity-50">{watching ? "★ Připnuto" : "☆ Připnout"}</button></div>
        <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-3 sm:justify-end"><TeamLogo src={fixture.home.logoUrl} alt={fixture.home.name} size={48} /><strong>{fixture.home.name}</strong>{redHome > 0 ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs">{redHome} ČK</span> : null}</div>
          <div className="text-center"><p className="text-xs font-bold text-red-300">{match?.minute ?? fixture.elapsed ?? ""}&apos; · ŽIVĚ</p><p className="mt-1 text-3xl font-black tabular-nums">{match?.homeGoals ?? fixture.liveHome ?? 0} : {match?.awayGoals ?? fixture.liveAway ?? 0}</p></div>
          <div className="flex items-center gap-3"><TeamLogo src={fixture.away.logoUrl} alt={fixture.away.name} size={48} /><strong>{fixture.away.name}</strong>{redAway > 0 ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs">{redAway} ČK</span> : null}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-3 text-[11px] text-white/80"><span>{fixture.leagueName}</span>{fixture.competitionRound ? <span>{fixture.competitionRound}</span> : null}{venue?.capacity ? <span>{venue.capacity.toLocaleString("cs-CZ")} míst</span> : null}{venue?.surface ? <span>{venue.surface}</span> : null}</div>
      </div>
    </div>
    {state.loading && !payload ? <p className="p-6 text-center text-sm text-muted">Načítám živý průběh…</p> : state.error && !payload ? <p className="p-6 text-center text-sm text-negative">Match Center se nepodařilo obnovit.</p> : <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-background p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Živý průběh</h3>{newest ? <span className="text-[10px] font-semibold text-negative">Poslední událost {newest.minute}&apos;</span> : null}</div>{events.length ? <EventTimeline events={events} homeTeamId={fixture.home.id} newestFirst /> : <p className="mt-3 text-xs text-muted">Zatím bez zaznamenané události.</p>}</section>
        <section className="rounded-xl border border-border bg-background p-3"><h3 className="text-sm font-bold">Statistiky zápasu</h3><div className="mt-3 space-y-2">{([ ["xG", "XG"], ["Střely", "SHOTS"], ["Na branku", "SHOTS_ON_TARGET"], ["Držení", "POSSESSION", "%"], ["Přihrávky", "PASSES_TOTAL"], ["Rohy", "CORNERS"], ["Fauly", "FOULS"], ["Žluté karty", "YELLOW_CARDS"] ] as const).map(([label, key, suffix]) => home[key] == null && away[key] == null ? null : <div key={key} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-xs"><b className="text-right tabular-nums">{stat(home[key], suffix)}</b><span className="text-center text-muted">{label}</span><b className="tabular-nums">{stat(away[key], suffix)}</b></div>)}</div></section>
        <LineupsPanel fixture={fixture} lineups={payload?.lineups ?? []} />
      </div>
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-background p-3"><h3 className="text-sm font-bold">Průběh a momentum</h3><p className="mt-2 text-xs text-muted">{momentumText(home, away, fixture)}</p><div className="mt-3 grid grid-cols-2 gap-2"><MetricBox label="xG od začátku" value={`${stat(home.XG)} : ${stat(away.XG)}`} /><MetricBox label="Střely na branku" value={`${stat(home.SHOTS_ON_TARGET)} : ${stat(away.SHOTS_ON_TARGET)}`} /></div></section>
        <section className="rounded-xl border border-accent-strong/30 bg-accent/10 p-3"><div className="flex items-center justify-between gap-2"><div><p className="page-kicker">Experimentální live model</p><h3 className="mt-0.5 text-sm font-extrabold">{payload?.pro ? payload.candidates.length ? "Kandidát ke zvážení" : payload.model?.lowConfidence ? "Málo dat" : "Sledovat vývoj" : "Pokročilá analýza PRO"}</h3></div><span className="rounded-full bg-warning/15 px-2 py-1 text-[10px] font-bold text-warning">LIVE TEST</span></div>
          {!payload?.pro ? <p className="mt-3 text-xs text-muted">PRO zpřístupní live pravděpodobnosti, skutečné kurzy, edge a experimentální 1u výběry.</p> : <>{probs ? <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs"><Probability label="Domácí" value={probs.home} /><Probability label="Remíza" value={probs.draw} /><Probability label="Hosté" value={probs.away} /></div> : <p className="mt-3 text-xs text-muted">Pro tento zápas zatím chybí použitelný modelový snapshot.</p>}
          {scenarios.length ? <div className="mt-3 space-y-2">{scenarios.map((row) => <div key={row.market} className={`rounded-lg border p-2 text-xs ${row.candidate ? "border-positive/30 bg-positive/10" : "border-border bg-background/70"}`}><div className="flex items-center justify-between gap-2"><strong>{row.label}</strong><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${row.candidate ? "bg-positive/15 text-positive" : row.interesting ? "bg-warning/15 text-warning" : "bg-border text-muted"}`}>{row.status}</span></div><p className="mt-1 tabular-nums">Model {pct(row.model)} · trh {pct(row.marketProbability)} · kurz {row.odds.toFixed(2)} · EV {pct(row.ev)}</p><p className="mt-1 text-[10px] text-muted">{row.reason} · {row.bookmaker}</p></div>)}</div> : probs ? <ModelOnlyOpportunities probabilities={probs} scoreHome={match?.homeGoals ?? fixture.liveHome ?? 0} scoreAway={match?.awayGoals ?? fixture.liveAway ?? 0} /> : null}
          {probs ? <div className="mt-3 border-t border-border pt-2 text-[10px] text-muted"><strong className="text-foreground">Výzkumné týmové góly</strong><p className="mt-1">{fixture.home.name}: Over 0,5 {optionalPct(probs.homeOver05)} · Over 1,5 {optionalPct(probs.homeOver15)}</p><p>{fixture.away.name}: Over 0,5 {optionalPct(probs.awayOver05)} · Over 1,5 {optionalPct(probs.awayOver15)}</p><p className="mt-1">Bez konzistentního live kurzu nejde o kandidáta ani simulovanou sázku.</p></div> : null}</>}
          {href ? <Link href={href} className="mt-3 inline-flex text-xs font-bold underline underline-offset-2">Otevřít předzápasové Porovnání</Link> : null}
        </section>
        <p className="text-right text-[10px] text-muted">{payload?.updatedAt ? `Aktualizováno ${new Date(payload.updatedAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Čeká na první snímek"}</p>
      </div>
    </div>}
  </div>;
}

function MetricBox({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border p-2"><span className="block text-[10px] text-muted">{label}</span><strong className="mt-0.5 block text-sm tabular-nums">{value}</strong></div>; }
function Probability({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-background p-2"><span className="block text-[10px] text-muted">{label}</span><strong>{pct(value)}</strong></div>; }
function LineupsPanel({ fixture, lineups }: { fixture: UpcomingFixture; lineups: Lineup[] }) {
  const sides = [fixture.home, fixture.away].map((team) => ({ team, lineup: lineups.find((row) => row.teamId === team.id) }));
  return <section className="rounded-xl border border-border bg-background p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">Sestavy</h3>{lineups.length ? <span className="text-[10px] font-semibold text-positive">Potvrzené zdrojem</span> : <span className="text-[10px] text-muted">Čeká na data</span>}</div>
    {lineups.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{sides.map(({ team, lineup }) => <div key={team.id} className="min-w-0 rounded-lg border border-border p-2"><div className="flex items-center gap-2"><TeamLogo src={team.logoUrl} alt={team.name} size={24} /><strong className="truncate text-xs">{team.name}</strong></div>{lineup ? <><p className="mt-2 text-[10px] text-muted">{lineup.formation ? `Rozestavení ${lineup.formation}` : "Rozestavení neuvedeno"}{lineup.coachName ? ` · ${lineup.coachName}` : ""}</p><ol className="mt-2 space-y-1 text-xs">{lineup.starters.map((player) => <li key={`${player.playerId ?? player.name}-${player.number ?? ""}`} className="flex gap-2"><span className="w-5 shrink-0 text-right tabular-nums text-muted">{player.number ?? ""}</span><span className="truncate">{player.name}</span>{player.position ? <span className="ml-auto text-[10px] text-muted">{player.position}</span> : null}</li>)}</ol>{lineup.substitutes.length ? <details className="mt-2"><summary className="cursor-pointer text-[10px] font-semibold text-muted">Náhradníci ({lineup.substitutes.length})</summary><ul className="mt-2 space-y-1 text-xs">{lineup.substitutes.map((player) => <li key={`${player.playerId ?? player.name}-${player.number ?? ""}`} className="truncate">{player.number != null ? `${player.number}. ` : ""}{player.name}</li>)}</ul></details> : null}</> : <p className="mt-2 text-xs text-muted">Sestava tohoto týmu zatím není dostupná.</p>}</div>)}</div> : <p className="mt-3 text-xs text-muted">Poskytovatel zatím neposlal použitelnou sestavu. Match Center ji zobrazí automaticky po zachycení; chybějící hráče nedoplňujeme odhadem.</p>}
  </section>;
}
function ModelOnlyOpportunities({ probabilities, scoreHome, scoreAway }: { probabilities: LiveProbabilities; scoreHome: number; scoreAway: number }) {
  const result = [{ label: "Domácí", value: probabilities.home }, { label: "Remíza", value: probabilities.draw }, { label: "Hosté", value: probabilities.away }].sort((a, b) => b.value - a.value)[0];
  const total = scoreHome + scoreAway;
  const availableLines = Object.entries(probabilities.totalOver).map(([line, over]) => ({ line: Number(line), over })).filter((row) => Number.isFinite(row.line)).sort((a, b) => a.line - b.line);
  const relevant = availableLines.filter((row) => row.line > total).slice(0, 2);
  const goalRows = (relevant.length ? relevant : availableLines.slice(-1)).map((row) => row.over >= .5 ? { label: `Over ${row.line.toFixed(1)} gólu`, value: row.over } : { label: `Under ${row.line.toFixed(1)} gólu`, value: 1 - row.over });
  const btts = probabilities.bttsYes >= .5 ? { label: "Oba týmy skórují · Ano", value: probabilities.bttsYes } : { label: "Oba týmy skórují · Ne", value: 1 - probabilities.bttsYes };
  const rows = [{ label: `Výsledek · ${result.label}`, value: result.value }, ...goalRows, btts];
  return <div className="mt-3 rounded-lg border border-border bg-background/70 p-2"><div className="flex items-center justify-between gap-2"><strong className="text-xs">Modelové příležitosti</strong><span className="rounded-full bg-border px-2 py-0.5 text-[9px] font-bold text-muted">BEZ LIVE KURZU</span></div><div className="mt-2 divide-y divide-border">{rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-3 py-2 text-xs"><span>{row.label}</span><strong className="tabular-nums">{pct(row.value)}</strong></div>)}</div><p className="mt-1 text-[10px] leading-4 text-muted">Pravděpodobnosti reagují na skóre, minutu, střely, xG a červené karty. Bez dostupné ceny nelze určit EV ani vytvořit auditovatelný výběr 1u.</p></div>;
}
type LiveScenario = { market: string; label: string; model: number; marketProbability: number; odds: number; ev: number; bookmaker: string; candidate: boolean; interesting: boolean; status: string; reason: string };
function buildLiveScenarios(probabilities: LiveProbabilities, odds: Payload["odds"], candidates: Payload["candidates"], lowConfidence: boolean, minute: number): LiveScenario[] {
  const active = odds.filter((row) => !row.blocked && !row.stopped && row.decimalOdds > 1);
  const groups: Array<{ market: string; rows: Payload["odds"] }> = [];
  const oneXTwo = active.filter((row) => row.market === "LIVE_1X2");
  if (["HOME", "DRAW", "AWAY"].every((side) => oneXTwo.some((row) => row.side === side))) groups.push({ market: "LIVE_1X2", rows: oneXTwo });
  const btts = active.filter((row) => row.market === "LIVE_BTTS");
  if (["YES", "NO"].every((side) => btts.some((row) => row.side === side))) groups.push({ market: "LIVE_BTTS", rows: btts });
  const goalLines = [...new Set(active.filter((row) => row.market === "LIVE_GOALS" && row.line != null).map((row) => row.line!))];
  const mainLine = goalLines.find((line) => active.some((row) => row.market === "LIVE_GOALS" && row.line === line && row.main)) ?? goalLines[0];
  const goals = active.filter((row) => row.market === "LIVE_GOALS" && row.line === mainLine);
  if (["OVER", "UNDER"].every((side) => goals.some((row) => row.side === side))) groups.push({ market: "LIVE_GOALS", rows: goals });
  return groups.flatMap(({ market, rows }) => {
    const implied = rows.map((row) => ({ row, inverse: 1 / row.decimalOdds }));
    const overround = implied.reduce((sum, item) => sum + item.inverse, 0);
    const options = implied.map(({ row, inverse }) => {
      const model = market === "LIVE_1X2" ? row.side === "HOME" ? probabilities.home : row.side === "DRAW" ? probabilities.draw : probabilities.away : market === "LIVE_BTTS" ? row.side === "YES" ? probabilities.bttsYes : 1 - probabilities.bttsYes : row.line == null ? null : probabilities.totalOver[row.line.toFixed(1)] == null ? null : row.side === "OVER" ? probabilities.totalOver[row.line.toFixed(1)] : 1 - probabilities.totalOver[row.line.toFixed(1)];
      if (model == null) return null;
      const marketProbability = inverse / overround;
      return { row, model, marketProbability, edge: model - marketProbability, ev: model * row.decimalOdds - 1 };
    }).filter((row): row is NonNullable<typeof row> => row != null).sort((a, b) => b.ev - a.ev);
    const best = options[0];
    if (!best) return [];
    const frozen = candidates.find((row) => row.market === market && row.side === best.row.side && row.line === best.row.line);
    const interesting = !lowConfidence && minute >= 15 && minute <= 80 && best.edge >= .05 && best.ev >= .04;
    const status = frozen ? "Kandidát 1u" : lowConfidence ? "Málo dat" : interesting ? "Čeká na potvrzení" : "Bez výhody";
    const reason = frozen ? `Výběr byl zmrazen v ${frozen.minute}. minutě` : lowConfidence ? "Live vstupy zatím nejsou dostatečně spolehlivé" : minute < 15 || minute > 80 ? "Mimo povolené okno 15.–80. minuta" : best.edge < .05 ? `Rozdíl proti trhu je jen ${(best.edge * 100).toFixed(1)} p. b.` : best.ev < .04 ? `EV je jen ${(best.ev * 100).toFixed(1)} %` : "Podmínky splňuje poprvé; potřebuje druhý shodný snímek";
    return [{ market, label: marketLabel(market, best.row.side, best.row.line), model: best.model, marketProbability: best.marketProbability, odds: best.row.decimalOdds, ev: best.ev, bookmaker: best.row.bookmaker, candidate: Boolean(frozen), interesting, status, reason }];
  });
}
function momentumText(home: Stats, away: Stats, fixture: UpcomingFixture) {
  const hxg = home.XG ?? 0, axg = away.XG ?? 0, hs = home.SHOTS_ON_TARGET ?? 0, as = away.SHOTS_ON_TARGET ?? 0;
  if (Math.abs(hxg - axg) < .25 && Math.abs(hs - as) <= 1) return "Dosavadní nebezpečnost je poměrně vyrovnaná; výrazná převaha není potvrzená.";
  const name = hxg + hs * .12 > axg + as * .12 ? fixture.home.name : fixture.away.name;
  return `${name} si zatím vytváří nebezpečnější průběh podle xG a střel na branku. Jde o dosavadní stav, ne jistotu dalšího vývoje.`;
}
