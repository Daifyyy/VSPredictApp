"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { isStrategyHubId, type StrategyHubDefinition, type StrategyHubId } from "@/lib/picks/strategyHub";
import type { StrategyHubMetrics, StrategyHubOpportunity, StrategyHubPrediction, StrategyHubTicket } from "@/lib/data/strategyHubStore";
import { AppHeader } from "./AppHeader";
import { useCurrentUser } from "./useCurrentUser";
import { PressureFlowPredictions, type PressureFlowView } from "./PressureFlowPredictions";
import { TEAM_GOALS_QUARANTINE_MESSAGE } from "@/lib/picks/teamMarketSafety";
import { defaultStrategyCohort, isOverCohort, OVER_COHORTS, overCohortDefinition, type OverCohort } from "@/lib/picks/overCohorts";
import { STRATEGY_HUB_CATALOG } from "@/lib/picks/strategyHub";
import { groupStrategyHubCatalog, ONE_X_TWO_RESEARCH } from "@/lib/picks/strategyHubPresentation";
import { OneXTwoForecasts, type OneXTwoForecast } from "./OneXTwoForecasts";
import { OneXTwoEvaluation } from "./OneXTwoEvaluation";
import type { OneXTwoEvaluationReport } from "@/lib/data/oneXTwoEvaluationStore";

type CatalogItem = StrategyHubDefinition & { statusLabel: string };
type Payload = { cohort?: { id: OverCohort } | null; asOf?: string | null; stale?: boolean; limitedReason?: string | null; date: string; strategy: StrategyHubId; catalog: CatalogItem[]; locked: boolean; data?: { opportunities: StrategyHubOpportunity[]; predictions?: StrategyHubPrediction[]; outcomePredictions?: OneXTwoForecast[]; outcomeEvaluation?: OneXTwoEvaluationReport | null; outcomePredictionsTruncated?: boolean; tickets: StrategyHubTicket[]; metrics: StrategyHubMetrics | null; coverage: { candidates: number; priced: number; tickets: number }; emptyReason: string | null } };

const emptyLabels: Record<string, string> = {
  TEAM_MARKET_DATA_QUARANTINE: TEAM_GOALS_QUARANTINE_MESSAGE,
  NOT_ENOUGH_VALUE_LEGS: "Pro tento den nevznikly alespoň tři samostatně kvalitní VALUE nohy.",
  NOT_ENOUGH_CONTEXTUAL_LEGS: "Pro tento den nevznikly alespoň tři kontextově obhajitelné ELO příležitosti.",
  NOT_ENOUGH_BALANCED_LEGS: "Kandidáti existují, ale netvoří vyvážený tiket s alespoň dvěma nosnými nohami. Více drahých outsiderů do jedné akumulace neskládáme.",
  NOT_ENOUGH_CANDIDATES: "Žádný výběr nesplnil pravidla této strategie.",
  WAITING_FOR_ODDS: "Čekáme na dostupné realizovatelné kurzy.",
  INSUFFICIENT_ELO_HISTORY: "Týmy zatím nemají dostatečnou Elo historii.",
  CONTEXT_VETO: "Kandidáty vyřadil závažný kontextový rozpor.",
  NO_FORECASTS: "Pro tento den není dostupná žádná výzkumná prognóza.",
  NO_MARKET: "Pro tuto strategii není dostupný sázkový trh.",
};

const pct = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(1)} %`;
const units = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} j`;
const dateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const shiftDate = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
const resultLabel = (result: StrategyHubOpportunity["outcome"]) => result === "WON" ? "Vyhráno" : result === "LOST" ? "Prohráno" : result === "VOID" ? "Vráceno" : "Čeká";

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-xl border border-border bg-background/60 p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span><strong className="mt-1 block text-xl tabular-nums text-foreground">{value}</strong>{note ? <small className="mt-0.5 block text-[10px] text-muted">{note}</small> : null}</div>;
}

export function Stats({ metrics, definition }: { metrics: StrategyHubMetrics | null; definition: CatalogItem }) {
  if (metrics == null) return <p role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">Historický souhrn dosud není připraven. Bilance není dostupná; nejde o nulovou bilanci.</p>;
  if (metrics.limitedReason === "TEAM_MARKET_DATA_QUARANTINE") return <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">{TEAM_GOALS_QUARANTINE_MESSAGE} Archiv zůstává v Řízení modelů; nejde o nulovou bilanci.</p>;
  const all = metrics.all;
  const recent = metrics.recent;
  const noun = metrics.unit === "TICKETS" ? "tiketů" : "výběrů";
  if (metrics.unit === "FORECASTS") return <>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Metric label="Vyhodnoceno" value={String(all.settled)} note={`${all.pending} čeká · prognóz`} />
      <Metric label="Průměrná chyba" value={metrics.forecastMae == null ? "—" : metrics.forecastMae.toFixed(2)} note="MAE · nižší je lepší" />
      <Metric label="Systematická odchylka" value={metrics.forecastBias == null ? "—" : `${metrics.forecastBias >= 0 ? "+" : ""}${metrics.forecastBias.toFixed(2)}`} note="plus = model nadhodnocuje" />
      <Metric label="Pokrytí výsledkem" value={pct(metrics.actualCoverage ?? null)} note="kompletní statistiky obou týmů" />
    </div>
    {all.settled < definition.minimumSample ? <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Vzorek {all.settled}/{definition.minimumSample} zatím nestačí k potvrzení modelu.</p> : null}
  </>;
  return <>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-6">
      <Metric label="Uzavřeno" value={String(all.settled)} note={`${all.pending} čeká · ${noun}`} />
      <Metric label="Úspěšnost" value={pct(all.accuracy)} note={metrics.selectionAccuracy != null && metrics.unit === "TICKETS" ? `nohy ${pct(metrics.selectionAccuracy)}` : undefined} />
      <Metric label="Profit" value={units(all.profit)} note="vklad 1 jednotka" />
      <Metric label="ROI" value={pct(all.roi)} note="jen zvolená kohorta" />
      <Metric label="Průměrný kurz" value={all.averageOdds?.toFixed(2) ?? "—"} note="jen zmrazené ceny" />
      <Metric label="Posledních 30 dní" value={recent.roi == null ? "—" : pct(recent.roi)} note={`${recent.settled} uzavřeno`} />
    </div>
    {all.settled < definition.minimumSample ? <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Vzorek {all.settled}/{definition.minimumSample} zatím nestačí k potvrzení strategie.</p> : null}
    <p className="mt-3 text-xs text-muted">Úspěšnost ani kladné ROI samy nepotvrzují výhodu. Dosažení počtu vzorků není schválení strategie. Kohorty mohou mít různá období a překrývající se zápasy.</p>
    {metrics.direct && metrics.synthetic ? <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">Rozdělení VALUE podle ceny</summary><p className="mt-2">Přímé ceny: {metrics.direct.settled} uzavřeno · ROI {pct(metrics.direct.roi)}. Odhadnuté ceny: {metrics.synthetic.settled} uzavřeno · ROI {pct(metrics.synthetic.roi)}.</p></details> : null}
  </>;
}

function OpportunityCard({ item }: { item: StrategyHubOpportunity }) {
  const color = item.outcome === "WON" ? "text-positive bg-positive/10" : item.outcome === "LOST" ? "text-negative bg-negative/10" : "text-muted bg-border/50";
  const status = item.priceKind === "NONE" && item.score ? "Vyhodnoceno" : resultLabel(item.outcome);
  return <article className="rounded-xl border border-border bg-surface p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">{item.leagueName} · {new Date(item.kickoff).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</p><h3 className="mt-1 text-sm font-bold">{item.homeName} – {item.awayName}</h3></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${color}`}>{status}{item.score ? ` · ${item.score}` : ""}</span></div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-border py-3"><strong className="text-base text-foreground">{item.selection}</strong><div className="text-right"><strong className="block text-base tabular-nums">{item.odds?.toFixed(2) ?? "Bez kurzu"}</strong><span className="text-[9px] font-bold uppercase text-muted">{item.priceKind === "SYNTHETIC" ? "odhad ceny" : item.priceKind === "DIRECT" ? item.bookmaker ?? "přímý kurz" : "prognóza"}</span></div></div>
    {item.strategyConflict && <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs font-bold text-warning">Rozpor strategií: {item.strategyConflict}</p>}
    <p className="mt-3 text-xs leading-5"><strong>Proč prošla:</strong> {item.reason}</p><p className="mt-1 text-xs leading-5 text-muted"><strong>Hlavní riziko:</strong> {item.risk}</p>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">{item.probability != null && <span>Model {pct(item.probability)}</span>}{item.marketProbability != null && <span>Trh {pct(item.marketProbability)}</span>}{item.edge != null && <span>Edge {pct(item.edge)}</span>}{item.expectedValue != null && <span>EV {pct(item.expectedValue)}</span>}{item.confidence != null && <span>Jistota {item.confidence.toFixed(1)}</span>}{item.ticketSlots.length > 0 && <span>Tiket {item.ticketSlots.map((slot) => slot === 1 ? "A" : "B").join(", ")}</span>}</div>
  </article>;
}

function Tickets({ tickets }: { tickets: StrategyHubTicket[] }) {
  if (!tickets.length) return null;
  return <section className="mt-6"><div className="mb-3"><p className="page-kicker">Přirozená akumulace</p><h2 className="mt-1 text-lg font-bold">Sestavené tikety</h2></div><div className="grid gap-3 sm:grid-cols-2">{tickets.map((ticket) => <article key={ticket.slot} className="rounded-xl border border-accent-strong/25 bg-accent/10 p-4"><div className="flex items-center justify-between"><strong>Tiket {ticket.slot === 1 ? "A" : "B"}</strong><span className="rounded-full bg-surface px-2 py-1 text-xs font-bold">{resultLabel(ticket.outcome)}</span></div><p className="mt-3 text-2xl font-black tabular-nums">Kurz {ticket.odds?.toFixed(2) ?? "—"}</p><p className="mt-1 text-xs text-muted">{ticket.fixtureIds.length} nohy · {ticket.estimatedPriceCount ? `${ticket.estimatedPriceCount} odhadnuté ceny` : "všechny ceny přímé"}</p>{ticket.profit != null && <p className={`mt-2 text-sm font-bold ${ticket.profit >= 0 ? "text-positive" : "text-negative"}`}>Profit {units(ticket.profit)}</p>}</article>)}</div></section>;
}

export function StrategyHub() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = useMemo(() => dateKey(new Date()), []);
  const requestedStrategy = params.get("strategy");
  const strategy: StrategyHubId = isStrategyHubId(requestedStrategy) ? requestedStrategy : "VALUE";
  const requestedCohort = params.get("cohort") ?? defaultStrategyCohort(strategy);
  const cohort: OverCohort = strategy === "OVER_25" && isOverCohort(requestedCohort) ? requestedCohort : "current";
  const selectedCohort = strategy === "OVER_25" ? overCohortDefinition(cohort) : null;
  const performance = params.get("view") === "performance" || (strategy === "OVER_25" && cohort !== "original");
  const requestedDate = params.get("date");
  const minDate = shiftDate(today, -1), maxDate = shiftDate(today, 7);
  const date = requestedDate && requestedDate >= minDate && requestedDate <= maxDate ? requestedDate : today;
  const requestedMarket = params.get("market");
  const pressureView: PressureFlowView = requestedMarket === "over25" || requestedMarket === "btts" || requestedMarket === "team" ? requestedMarket : "all";
  const [loadedPayload, setPayload] = useState<Payload | null>(null);
  const payload = loadedPayload?.strategy === strategy && loadedPayload.date === date && (loadedPayload.cohort?.id ?? "current") === cohort ? loadedPayload : null;
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { setPayload(null); setError(null); }); fetch(`/api/picks/strategies?strategy=${strategy}&date=${date}&cohort=${cohort}`, { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Přehled se nepodařilo načíst."); return body as Payload; }).then(setPayload).catch((reason) => { if (reason?.name !== "AbortError") setError(reason.message); }); return () => controller.abort(); }, [strategy, date, cohort]);
  const navigate = (nextStrategy: StrategyHubId, nextDate = date, nextMarket: PressureFlowView = nextStrategy === strategy ? pressureView : "all", nextCohort: OverCohort = nextStrategy === strategy ? cohort : defaultStrategyCohort(nextStrategy), nextPerformance = nextStrategy === strategy ? performance : false) => { const query = new URLSearchParams(); if (nextStrategy !== "VALUE") query.set("strategy", nextStrategy); if (nextDate !== today) query.set("date", nextDate); if (nextStrategy === "PRESSURE_FLOW_V5" && nextMarket !== "all") query.set("market", nextMarket); if (nextStrategy === "OVER_25") query.set("cohort", nextCohort); if (nextPerformance) query.set("view", "performance"); router.push(`${pathname}${query.size ? `?${query}` : ""}`); };
  const unlock = async () => {
    if (!user) { await signIn("google", { callbackUrl: window.location.href }); return; }
    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST" });
      const value = await response.json().catch(() => null) as { url?: string } | null;
      if (value?.url) { window.location.href = value.url; return; }
    } finally { setCheckoutLoading(false); }
    window.alert("Odemknutí PRO se teď nepodařilo spustit.");
  };
  const catalog = payload?.catalog ?? STRATEGY_HUB_CATALOG.map(item => ({ ...item, statusLabel: item.id === "VALUE" || item.id === "ELO_INTUITION" ? "Experiment" : "Neověřená strategie" }));
  const groups = groupStrategyHubCatalog(catalog);
  const baseDefinition = catalog.find((item) => item.id === strategy);
  const definition = baseDefinition && selectedCohort ? { ...baseDefinition, title: selectedCohort.title, description: selectedCohort.decision,
    policyVersion: selectedCohort.policyVersion, statusLabel: cohort !== "original" ? "Historický archiv" : "Aktivní · ziskovost neověřená" }
    : baseDefinition && strategy === "ONE_X_TWO" ? { ...baseDefinition, title: performance ? "1X2 · historie výběrů" : "1X2 · předzápasový audit", description: performance ? "Bilance dosavadní strategie výběru, nikoli validace plného modelu 1X2." : "Zachycené odhady současného modelu, nikoli sázkové výběry.", statusLabel: ONE_X_TWO_RESEARCH.statusLabel }
    : baseDefinition && (strategy === "VALUE" || strategy === "ELO_INTUITION") ? { ...baseDefinition, statusLabel: "Experiment · neověřeno" } : baseDefinition;
  const data = payload?.data;
  const displayedOpportunities = data?.opportunities.filter((item) => strategy !== "PRESSURE_FLOW_V5" || pressureView === "all" || pressureView === "over25" && item.market === "OVER_25" || pressureView === "btts" && item.market === "BTTS" || pressureView === "team" && item.market?.startsWith("TEAM_")) ?? [];
  const locked = payload?.locked ?? false;
  return <><AppHeader user={user} /><main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:pt-8">
    {payload?.stale && <p role="status" className="ui-panel mb-4 p-3 text-sm text-warning">{payload.limitedReason === "STRATEGY_METRICS_NOT_CAPTURED" ? "Historický souhrn dosud není připraven. Denní audit je oddělený od historické bilance; nejde o nulovou bilanci." : <>Bilance je z uloženého neaktuálního souhrnu ({payload.asOf ? new Date(payload.asOf).toLocaleString('cs-CZ') : 'čas neznámý'}). Nejde o nově přepočítané výsledky.</>}</p>}
    <div><p className="page-kicker">Výběry a výzkum přehledně</p><h1 className="page-title">Sázkové strategie</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Původní Over a výzkum 1X2 na jednom místě. Výběry i bilance zůstávají oddělené podle pravidel; ziskovost není doložená.</p></div>
    <nav aria-label="Hlavní strategie" className="mt-5 grid gap-3 sm:grid-cols-2">
      {groups.primary.map(item => <button key={item.id} type="button" aria-pressed={item.id === strategy} onClick={() => item.id === "OVER_25" ? navigate(item.id, date, "all", "original", false) : navigate(item.id)} className={`rounded-xl border p-4 text-left transition ${item.id === strategy ? "border-accent-strong bg-accent text-accent-ink" : "border-border bg-surface hover:border-accent-strong"}`}>
        <strong className="block text-lg">{item.id === "OVER_25" ? "Původní Over 2,5" : "1X2"}</strong>
        <span className="mt-1 block text-xs">{item.id === "OVER_25" ? "Původní pravidla · ziskovost neověřená" : "Výzkum · domácí / remíza / hosté"}</span>
      </button>)}
    </nav>
    <nav aria-label="Experimentální strategie" className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-bold text-muted">Experimenty</span>
      {groups.experiments.map(item => <button key={item.id} type="button" aria-pressed={item.id === strategy} onClick={() => navigate(item.id)} className={`rounded-lg border px-4 py-2 text-sm font-bold ${item.id === strategy ? "border-accent-strong bg-accent text-accent-ink" : "border-border bg-surface text-muted hover:text-foreground"}`}>{item.shortTitle} · experiment</button>)}
    </nav>
    <details key={strategy} open={groups.secondary.some(item => item.id === strategy)} className="mt-4 rounded-xl border border-border bg-surface p-3">
      <summary className="cursor-pointer text-sm font-semibold">Pozastavené a výzkumné strategie</summary>
      <p className="mt-2 text-xs text-muted">Další větve a jejich historie. Dostupnost přehledu neznamená aktivní sběr ani ověřené doporučení.</p>
      <nav aria-label="Další strategie" className="mt-3 flex flex-wrap gap-2">{groups.secondary.map(item => <button key={item.id} type="button" aria-pressed={item.id === strategy} onClick={() => navigate(item.id)} className={`rounded-lg border px-3 py-2 text-sm ${item.id === strategy ? "border-accent-strong bg-accent text-accent-ink" : "border-border text-muted hover:text-foreground"}`}>{item.shortTitle}</button>)}</nav>
    </details>
    {strategy === "ONE_X_TWO" && <section aria-labelledby="one-x-two-research" className="ui-panel mt-4 p-4 sm:p-5">
      <h2 id="one-x-two-research" className="text-lg font-bold">{ONE_X_TWO_RESEARCH.title}</h2>
      <p className="mt-2 text-sm leading-6">{ONE_X_TWO_RESEARCH.description}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{ONE_X_TWO_RESEARCH.selectionNote}</p>
      <p className="mt-3 rounded-lg bg-warning/10 p-3 text-sm text-warning">{ONE_X_TWO_RESEARCH.caution}</p>
    </section>}
    {strategy === "OVER_25" && <nav aria-label="Kohorta Overu" className="mt-3 flex flex-wrap gap-2">{[...OVER_COHORTS].sort((a, b) => Number(b.id === "original") - Number(a.id === "original")).map(item => <button key={item.id} aria-pressed={cohort === item.id} onClick={() => navigate(strategy, date, pressureView, item.id, item.id !== "original")} className={`rounded-lg border px-3 py-2 text-sm ${cohort === item.id ? "border-accent-strong bg-accent text-accent-ink" : "border-border bg-surface"}`}>{item.label}</button>)}</nav>}
    {(strategy !== "OVER_25" || cohort === "original") && <nav aria-label="Pohled strategie" className="mt-3 flex gap-2">{[{ label: "Dnes", value: false }, { label: "Výkonnost", value: true }].map(item => <button key={item.label} aria-pressed={performance === item.value} onClick={() => navigate(strategy, date, pressureView, cohort, item.value)} className={`rounded-lg border px-4 py-2 text-sm ${performance === item.value ? "border-accent-strong bg-accent text-accent-ink" : "border-border bg-surface"}`}>{item.label}</button>)}</nav>}
    {strategy === "ONE_X_TWO" && performance && !locked && data && <OneXTwoEvaluation report={data.outcomeEvaluation} />}
    {!payload && !error ? <div className="ui-panel mt-4 h-56 animate-pulse bg-border/30" /> : error ? <div role="alert" className="ui-panel mt-4 p-6 text-sm text-negative">{error}</div> : definition && <>
      <section className="ui-panel mt-4 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">{definition.title}</h2><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase bg-warning/10 text-warning`}>{definition.statusLabel}</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{definition.description}</p></div><span className="rounded-lg border border-border px-3 py-2 text-xs font-bold">Pravidla v{definition.policyVersion}</span></div>{data && performance ? <Stats metrics={data.metrics} definition={definition} /> : null}</section>
{!performance && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"><button disabled={date <= minDate} onClick={() => navigate(strategy, shiftDate(date, -1))} className="min-h-10 rounded-lg px-3 font-bold disabled:opacity-30" aria-label="Předchozí den">←</button><label className="text-center"><span className="block text-[10px] font-bold uppercase text-muted">Herní den</span><input type="date" min={minDate} max={maxDate} value={date} onChange={(event) => navigate(strategy, event.target.value)} className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold" /><span className="ml-2 hidden text-sm capitalize sm:inline">{dateLabel(date)}</span></label><button disabled={date >= maxDate} onClick={() => navigate(strategy, shiftDate(date, 1))} className="min-h-10 rounded-lg px-3 font-bold disabled:opacity-30" aria-label="Další den">→</button></div>}
      {locked ? <section className="ui-panel mt-4 border-dashed p-8 text-center"><p className="page-kicker">Obsah PRO</p><h2 className="mt-2 text-xl font-bold">Denní příležitosti a přesná bilance jsou uzamčené</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted">Veřejně vidíš princip a stav strategie. PRO zpřístupní zmrazené výběry, kurzy, výsledky a ROI.</p><button type="button" disabled={checkoutLoading} onClick={() => void unlock()} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-bold text-accent-ink disabled:opacity-60">{checkoutLoading ? "Otevírám…" : user ? "Odemknout PRO" : "Přihlásit přes Google"}</button></section> : data && !performance && <>
        {strategy === "ONE_X_TWO" ? <OneXTwoForecasts key={date} rows={data.outcomePredictions} truncated={data.outcomePredictionsTruncated} /> : <><section className="mt-6"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="page-kicker">{dateLabel(date)}</p><h2 className="mt-1 text-xl font-bold">Příležitosti pro vybraný den</h2></div><p className="text-xs text-muted">{data.coverage.candidates} vybráno · {data.coverage.priced} s kurzem</p></div>
          {displayedOpportunities.length ? <div className="mt-3 grid gap-3 lg:grid-cols-2">{displayedOpportunities.map((item) => <OpportunityCard key={item.id} item={item} />)}</div> : <div className="ui-panel mt-3 border-dashed p-7 text-center"><strong className="text-base">{data.emptyReason === "TEAM_MARKET_DATA_QUARANTINE" ? "Dočasně datově blokováno" : "Dnes tato strategie nic nevybrala"}</strong><p className="mx-auto mt-2 max-w-xl text-sm text-muted">{emptyLabels[data.emptyReason ?? ""] ?? "Nejsou dostupné kvalifikované příležitosti."}</p></div>}
        </section>{strategy === "PRESSURE_FLOW_V5" && data.predictions ? <PressureFlowPredictions rows={data.predictions} view={pressureView} onViewChange={(view) => navigate(strategy, date, view)} /> : null}<Tickets tickets={data.tickets} />{!definition.accumulator && <p className="mt-4 rounded-xl bg-background p-3 text-xs text-muted">Tato strategie sleduje jednotlivé výběry a akumulační tiket neskládá.</p>}</>}
      </>}
    </>}
    <p className="mt-8 text-center text-[11px] text-muted">Jde o prospektivní sledování modelů, nikoli doporučení vkladu. Výzkumné strategie nejsou ověřené.</p>
  </main></>;
}
