"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QUICK_FOCUS_IDS, QUICK_FOCUS_LABELS, type QuickFocus } from "@/lib/quickOverview";
import { competitionGroup } from "@/lib/data/catalog";
import { buildTipHref } from "./tipHref";
import { TeamLogo } from "./TeamLogo";
import type { SessionUser } from "./sessionUser";

interface FormItem { fixtureId: number; date: string; opponent: string | null; opponentLogo: string | null; result: "W" | "D" | "L" | null; goalsFor: number | null; goalsAgainst: number | null; xgFor: number | null; xgAgainst: number | null; venue: "HOME" | "AWAY" | "NEUTRAL" }
interface Split { played: number; win: number; draw: number; lose: number; goalsFor: number; goalsAgainst: number; points: number; ppg: number | null }
interface TeamContext { form: FormItem[]; formScore: number | null; points: number; xgDiff: number | null; restDays: number | null; cleanSheetPct: number | null; failedToScorePct: number | null; standing: { rank: number; points: number; played: number; ppg: number | null; home: Split; away: Split } | null; injuries: { playerId: number; name: string; reason: string }[] | null; injuriesUpdatedAt: string | null }
interface MarketSignal { market: "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS"; side: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER"; line: number | null; modelProbability: number; openMarketProbability: number; currentMarketProbability: number; samples: number }
interface QuickItem {
  rank: number; fixtureId: number; kickoff: string; leagueId: number; leagueName: string; round: string | null; editorialTitle: string | null;
  home: { id: number; name: string; logoUrl: string }; away: { id: number; name: string; logoUrl: string };
  expectedScore: { home: number; away: number }; lowConfidence: boolean; readinessSample: number;
  probabilities: { home: number; draw: number; away: number; over25: number; btts: number };
  counts: { corners: number | null; cards: number | null; cardsBeforeReferee: number | null; fouls: number | null };
  reason: string; modelProbability: number | null; marketProbability: number | null; marketMove: number | null; marketSamples: number;
  experimental: boolean; referee: { name: string; factor: number | null; sample: number } | null; h2hMeetings: number;
  marketSignals: MarketSignal[];
  matchState: "pending" | "live" | "settled";
  result: { home: number; away: number; hit: boolean | null; actualCounts: { corners: number | null; cards: number | null; fouls: number | null } | null } | null;
  context: { home: TeamContext; away: TeamContext; restDifference: number | null; restRelevant: boolean; completeness: number; standingsUpdatedAt: string | null } | null;
}
interface Payload { date: string; generatedAt: string; categories: Record<QuickFocus, QuickItem[]> }

export function QuickMatchOverview({ date, user, compact = false }: { date: string | null; user: SessionUser | null; compact?: boolean }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [focus, setFocus] = useState<QuickFocus>("1x2");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const isPro = user?.tier === "PRO";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("focus");
    const fixture = Number(params.get("quickFixture"));
    queueMicrotask(() => {
      if (QUICK_FOCUS_IDS.includes(requested as QuickFocus)) setFocus(requested as QuickFocus);
      if (fixture > 0) setExpanded(fixture);
    });
  }, []);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    queueMicrotask(() => { setPayload(null); setError(false); setExpanded(null); });
    fetch(`/api/picks/quick-overview?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<Payload>; })
      .then(setPayload).catch((cause) => { if (cause?.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, [date]);

  useEffect(() => {
    if (!isPro) return;
    fetch("/api/fixtures/favorites").then((response) => response.ok ? response.json() : null).then((body) => body && setFavorites(new Set(body.fixtures ?? []))).catch(() => {});
  }, [isPro]);

  const items = useMemo(() => payload?.categories[focus] ?? [], [payload, focus]);
  const writeUrl = (changes: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const selectFocus = (value: QuickFocus) => { setFocus(value); setExpanded(null); writeUrl({ focus: value === "1x2" ? null : value, quickFixture: null }); };
  const toggleFavorite = async (fixtureId: number) => {
    if (!isPro) return;
    const on = !favorites.has(fixtureId);
    setFavorites((current) => { const next = new Set(current); if (on) next.add(fixtureId); else next.delete(fixtureId); return next; });
    const response = await fetch("/api/fixtures/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "fixture", id: fixtureId, on }) });
    if (!response.ok) setFavorites((current) => { const next = new Set(current); if (on) next.delete(fixtureId); else next.add(fixtureId); return next; });
  };

  if (!date) return null;
  return <section className={`ui-panel overflow-hidden ${compact ? "mt-4" : "mt-5"}`} aria-labelledby={`quick-overview-${compact ? "home" : "picks"}`}>
    <div className="border-b border-border px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="page-kicker">Rychlý přehled</p><h2 id={`quick-overview-${compact ? "home" : "picks"}`} className="mt-1 text-lg font-extrabold text-foreground">Které zápasy dnes stojí za pozornost</h2><p className="mt-1 text-xs text-muted">Vyber oblast a uvidíš tři zápasy, u kterých je modelový důvod podívat se blíž.</p></div>
        {payload && <span className="text-[10px] text-muted">Aktualizováno {new Date(payload.generatedAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Kategorie rychlého přehledu">
        {QUICK_FOCUS_IDS.map((id) => <button key={id} type="button" aria-pressed={focus === id} onClick={() => selectFocus(id)} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold transition ${focus === id ? "border-accent bg-accent text-accent-ink" : "border-border bg-background text-muted hover:bg-accent/15 hover:text-foreground"}`}>{QUICK_FOCUS_LABELS[id]} <span className="opacity-65">{payload?.categories[id]?.length ?? 0}</span></button>)}
      </div>
    </div>
    {!payload && !error && <div className="grid gap-3 p-4 md:grid-cols-3">{[1,2,3].map((value) => <div key={value} className="h-48 animate-pulse rounded-xl bg-border/55" />)}</div>}
    {error && <p className="p-5 text-sm text-muted">Rychlý přehled se nyní nepodařilo načíst.</p>}
    {payload && !items.length && <p className="p-5 text-sm text-muted">Pro tuto kategorii dnes nemáme dostatečně srovnatelná data. Nic nedopočítáváme odhadem.</p>}
    {items.length > 0 && <div className={`grid gap-3 p-3 sm:p-4 ${compact ? "xl:grid-cols-3" : "lg:grid-cols-3"}`}>
      {items.map((item) => <QuickCard key={item.fixtureId} item={item} focus={focus} open={expanded === item.fixtureId} pro={isPro} favorite={favorites.has(item.fixtureId)} onFavorite={() => toggleFavorite(item.fixtureId)} onToggle={() => { const next = expanded === item.fixtureId ? null : item.fixtureId; setExpanded(next); writeUrl({ quickFixture: next == null ? null : String(next) }); }} />)}
    </div>}
  </section>;
}

function QuickCard({ item, focus, open, pro, favorite, onFavorite, onToggle }: { item: QuickItem; focus: QuickFocus; open: boolean; pro: boolean; favorite: boolean; onFavorite: () => void; onToggle: () => void }) {
  const compareHref = compareLink(item);
  return <article className={`rounded-xl border bg-background ${open ? "border-accent-strong shadow-sm lg:col-span-3" : "border-border"}`}>
    <div className="p-3.5">
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted"><span className="truncate">#{item.rank} · {item.editorialTitle ?? item.leagueName}{item.round ? ` · ${item.round}` : ""}</span><time>{new Date(item.kickoff).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</time></div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <Team team={item.home} /><div className="rounded-lg bg-surface px-2 py-1 text-xs font-black tabular-nums">{item.expectedScore.home.toFixed(1)}–{item.expectedScore.away.toFixed(1)}</div><Team team={item.away} />
      </div>
      <div className="mt-3 rounded-lg bg-accent/15 px-3 py-2 text-center text-xs font-bold text-foreground">{!pro && focus === "market" ? "Výrazný rozdíl modelu a trhu" : item.reason}</div>
      {item.result && <div className={`mt-2 rounded-lg px-3 py-2 text-center text-xs font-bold ${item.result.hit == null ? "bg-surface text-foreground" : item.result.hit ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{resultLabel(item, focus)}</div>}
      {!item.result && item.matchState === "live" && <div className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-center text-xs font-bold text-warning">Zápas právě probíhá</div>}
      {pro && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
        <SmallMetric label="Model" value={percent(item.modelProbability)} />
        <SmallMetric label="Otevření trhu" value={percent(relevantSignal(item, focus)?.openMarketProbability ?? null)} />
        <SmallMetric label="Poslední stav" value={percent(relevantSignal(item, focus)?.currentMarketProbability ?? null)} detail={movement(relevantSignal(item, focus) ? relevantSignal(item, focus)!.currentMarketProbability - relevantSignal(item, focus)!.openMarketProbability : null)} />
      </div>}
      <ContextStrip item={item} />
      <div className="mt-3 flex flex-wrap gap-1.5">{item.lowConfidence && <Badge tone="warn">Omezený vzorek</Badge>}{item.experimental && <Badge tone="warn">Experimentální · Evropa</Badge>}<Badge>Data {item.context?.completeness ?? 0} %</Badge>{item.context?.restRelevant && <Badge tone="warn">Rozdíl odpočinku {Math.abs(item.context.restDifference!)} dny</Badge>}</div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className={`flex min-h-11 flex-1 items-center justify-between gap-3 rounded-lg border px-3 text-left text-xs font-bold transition ${open ? "border-accent-strong bg-accent/15 text-foreground" : "border-border bg-surface text-foreground hover:border-accent-strong hover:bg-accent/10"}`}><span><span className="block">Forma, tabulka a tempo</span><span className="mt-0.5 block text-[9px] font-medium text-muted">{open ? "Skrýt podrobnosti zápasu" : "Zobrazit důležité souvislosti"}</span></span><svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 7.5 5 5 5-5" /></svg></button>
        {pro ? <button type="button" aria-pressed={favorite} onClick={onFavorite} className={`grid min-h-11 min-w-11 place-items-center rounded-lg border border-border ${favorite ? "text-warning" : "text-muted"}`} aria-label={favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}>{favorite ? "★" : "☆"}</button> : null}
        <Link href={buildTipHref(item)} className="ui-button-secondary grid min-h-11 min-w-11 place-items-center px-0 text-base leading-none" aria-label={`Natipovat ${item.home.name} – ${item.away.name}`} title="Tipnout zápas">🎯</Link>
      </div>
    </div>
    {open && <div className="border-t border-border p-3 sm:p-4">
      {pro ? <ExpandedContext item={item} /> : <div className="rounded-xl bg-surface p-4 text-sm text-muted">Poslední výkony, domácí/venkovní bilance a detail trhu jsou součástí PRO.</div>}
      <Link href={compareHref} className="ui-button-primary mt-3 min-h-11 w-full px-4 text-sm">Otevřít kompletní Porovnání</Link>
    </div>}
  </article>;
}

function Team({ team }: { team: QuickItem["home"] }) { return <div className="min-w-0"><TeamLogo src={team.logoUrl} alt={team.name} size={34} /><strong className="mt-1 block truncate text-xs">{team.name}</strong></div>; }
function SmallMetric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-lg bg-surface px-2 py-2"><span className="block text-muted">{label}</span><strong className="mt-0.5 block text-foreground tabular-nums">{value}</strong>{detail && <span className="mt-0.5 block text-[9px] text-muted">{detail}</span>}</div>; }
function Badge({ children, tone = "normal" }: { children: React.ReactNode; tone?: "normal" | "warn" }) { return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone === "warn" ? "bg-warning/12 text-warning" : "bg-surface text-muted"}`}>{children}</span>; }

function ContextStrip({ item }: { item: QuickItem }) {
  const context = item.context;
  if (!context) return <p className="mt-3 text-[10px] text-muted">Kontext týmů není v uložené cache dostupný.</p>;
  return <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[10px] text-muted">
    <TeamMini context={context.home} align="left" /><span className="text-center uppercase">Forma</span><TeamMini context={context.away} align="right" />
  </div>;
}
function TeamMini({ context, align }: { context: TeamContext; align: "left" | "right" }) { return <div className={align === "right" ? "text-right" : "text-left"}><strong className="block text-foreground">{context.formScore == null ? "Málo dat" : `Forma ${context.formScore.toFixed(1)}/10`}</strong><div className={`mt-1 flex gap-1 ${align === "right" ? "justify-end" : "justify-start"}`} aria-label="Poslední čtyři zápasy">{context.form.slice(0, 4).map((match) => <FormPopover key={match.fixtureId} match={match} />)}</div><span className="mt-1 block">{context.standing ? `${context.standing.rank}. místo` : "Bez tabulky"} · {context.restDays == null ? "odpočinek —" : `${context.restDays} dní volna`}</span></div>; }

function FormPopover({ match }: { match: FormItem }) { const result = match.result === "W" ? "V" : match.result === "D" ? "R" : match.result === "L" ? "P" : "?"; const role = match.venue === "HOME" ? "domácí" : match.venue === "AWAY" ? "hosté" : "neutrální půda"; return <details className="group relative"><summary aria-label={`${result} proti ${match.opponent ?? "soupeři"}. Zobrazit detail zápasu`} className="flex min-h-11 min-w-8 cursor-pointer list-none flex-col items-center justify-center gap-0.5 rounded-md outline-none transition hover:bg-background focus-visible:ring-2 focus-visible:ring-accent-strong"><span aria-hidden className="flex h-3 items-center justify-center">{match.opponentLogo && <TeamLogo src={match.opponentLogo} alt="" size={12} />}</span><span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${match.result === "W" ? "bg-positive text-white" : match.result === "L" ? "bg-negative text-white" : "bg-muted/30 text-foreground"}`}>{result}</span></summary><div className="absolute left-0 z-30 mt-1 w-56 rounded-xl border border-border bg-surface p-3 text-left text-[11px] shadow-lg group-last:left-auto group-last:right-0"><div className="flex items-center gap-2 rounded-lg bg-background px-2 py-1.5">{match.opponentLogo && <TeamLogo src={match.opponentLogo} alt={match.opponent ?? "Soupeř"} size={18} />}<div className="min-w-0 flex-1"><strong className="block truncate text-foreground">{match.opponent ?? "Soupeř"}</strong><span className="text-[9px] uppercase tracking-wide text-muted">sledovaný tým {role}</span></div><div className="text-right tabular-nums"><strong className="block text-foreground">{match.goalsFor ?? "—"}:{match.goalsAgainst ?? "—"}</strong><span>xG {match.xgFor?.toFixed(2) ?? "—"}:{match.xgAgainst?.toFixed(2) ?? "—"}</span></div></div></div></details>; }

function ExpandedContext({ item }: { item: QuickItem }) {
  const context = item.context;
  if (!context) return null;
  return <div className="mb-3 grid gap-3 md:grid-cols-2">
    <RecentTeam title={item.home.name} context={context.home} split="home" />
    <RecentTeam title={item.away.name} context={context.away} split="away" />
    <TempoDiscipline item={item} />
    <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted md:col-span-2"><strong className="text-foreground">Co může zápas ovlivnit</strong><p className="mt-1">Odpočinek: {item.home.name} {context.home.restDays ?? "—"} dní, {item.away.name} {context.away.restDays ?? "—"} dní{context.restRelevant ? ` · rozdíl ${Math.abs(context.restDifference!)} dny stojí za pozornost` : ""}. H2H obsahuje {item.h2hMeetings} relevantních utkání.</p></div>
  </div>;
}
function RecentTeam({ title, context, split }: { title: string; context: TeamContext; split: "home" | "away" }) { const venue = context.standing?.[split]; return <div className="rounded-xl border border-border bg-surface p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{title}</strong><span className="text-xs text-muted">xG trend {signed(context.xgDiff)}</span></div><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-muted">Poslední zápasy · klepnutím zobrazíš xG</p><div className="mt-1 flex flex-wrap gap-1">{context.form.map((match) => <FormPopover key={match.fixtureId} match={match} />)}</div><div className="mt-3 space-y-2 border-t border-border pt-3 text-[10px]"><ContextRow label="V tabulce" value={context.standing ? `${context.standing.rank}. místo · ${context.standing.points} b.` : "—"} /><ContextRow label={`V-R-P (${split === "home" ? "doma" : "venku"})`} value={venue?.played ? `${venue.win}-${venue.draw}-${venue.lose} · ${venue.goalsFor}:${venue.goalsAgainst}` : "—"} /><ContextRow label="Čisté konto" value={formatRate(context.cleanSheetPct, context.form.length)} /><ContextRow label="Bez vstřeleného gólu" value={formatRate(context.failedToScorePct, context.form.length)} /></div>{context.injuries != null && <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted">Absence: {context.injuries.length ? context.injuries.slice(0, 3).map((item) => item.name).join(", ") : "bez aktuálního záznamu"}{context.injuries.length > 3 ? ` +${context.injuries.length - 3}` : ""}</p>}</div>; }

function ContextRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3"><span className="text-muted">{label}</span><strong className="text-right tabular-nums text-foreground">{value}</strong></div>; }

function TempoDiscipline({ item }: { item: QuickItem }) { const cardChange = item.counts.cards != null && item.counts.cardsBeforeReferee != null ? item.counts.cards - item.counts.cardsBeforeReferee : null; return <section className="rounded-xl border border-border bg-surface p-3 md:col-span-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">Tempo a disciplína</strong><p className="mt-1 text-[10px] text-muted">Zjednodušený odhad průběhu bez sázkového doporučení.</p></div><Badge tone="warn">Experimentální</Badge></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><SmallMetric label="Rohy" value={decimal(item.counts.corners)} /><SmallMetric label="Karty" value={decimal(item.counts.cards)} /><SmallMetric label="Fauly" value={decimal(item.counts.fouls)} /></div><p className="mt-2 text-[10px] text-muted">{refereeEffect(item, cardChange)}</p></section>; }

function refereeEffect(item: QuickItem, change: number | null) { if (!item.referee) return "Rozhodčí zatím není určen; karetní odhad jej nezohledňuje."; if (!item.referee.sample) return `${item.referee.name}: bez dostatečné historie, do odhadu karet nevstupuje.`; if (change == null || Math.abs(change) < .05) return `${item.referee.name}: neutrální vliv na karetní odhad.`; return `${item.referee.name}: ${change > 0 ? "zvyšuje" : "snižuje"} očekávání karet o ${Math.abs(change).toFixed(1)} (${item.counts.cardsBeforeReferee?.toFixed(1)} → ${item.counts.cards?.toFixed(1)}).`; }
function relevantSignal(item: QuickItem, focus: QuickFocus) { const market = focus === "goals" ? "OVER_25" : focus === "btts" ? "BTTS" : focus === "corners" ? "CORNERS" : focus === "cards" ? "CARDS" : focus === "1x2" ? "1X2" : null; return (market ? item.marketSignals.find((signal) => signal.market === market) : null) ?? item.marketSignals.find((signal) => signal.modelProbability === item.modelProbability) ?? item.marketSignals[0] ?? null; }
function percent(value: number | null) { return value == null ? "—" : `${Math.round(value * 100)} %`; }
function movement(value: number | null) { return value == null ? "bez srovnání" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} p. b. od otevření`; }
function signed(value: number | null) { return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}/záp.`; }
function decimal(value: number | null) { return value == null ? "—" : value.toFixed(1); }
function resultLabel(item: QuickItem, focus: QuickFocus) { const result = item.result!; const count = focus === "corners" ? result.actualCounts?.corners : focus === "cards" ? result.actualCounts?.cards : null; const base = count == null ? `Konečný stav ${result.home}:${result.away}` : `Skutečnost ${count} ${focus === "corners" ? "rohů" : "karet"}`; return `${base}${result.hit == null ? "" : result.hit ? " · původní scénář vyšel" : " · původní scénář nevyšel"}`; }
function formatRate(value: number | null, sample: number) { return value == null ? "—" : `${Math.round(value * 100)} % z ${sample} záp.`; }

function compareLink(item: QuickItem) {
  const group = competitionGroup(item.leagueId);
  const params = new URLSearchParams({ mode: group === "NATIONAL" ? "NATIONAL" : "CLUB", homeLeague: String(item.leagueId), awayLeague: String(item.leagueId), home: String(item.home.id), away: String(item.away.id), fixture: String(item.fixtureId) });
  if (group === "EUROPE") { params.set("context", "EURO_CUP"); params.set("homeName", item.home.name); params.set("awayName", item.away.name); params.set("homeLogo", item.home.logoUrl); params.set("awayLogo", item.away.logoUrl); }
  return `/porovnani?${params.toString()}`;
}
