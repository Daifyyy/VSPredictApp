"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { isStrategyHubId, type StrategyHubDefinition, type StrategyHubId } from "@/lib/picks/strategyHub";
import type { StrategyHubMetrics, StrategyHubOpportunity, StrategyHubTicket } from "@/lib/data/strategyHubStore";
import { AppHeader } from "./AppHeader";
import { useCurrentUser } from "./useCurrentUser";

type CatalogItem = StrategyHubDefinition & { statusLabel: string };
type Payload = { date: string; strategy: StrategyHubId; catalog: CatalogItem[]; locked: boolean; data?: { opportunities: StrategyHubOpportunity[]; tickets: StrategyHubTicket[]; metrics: StrategyHubMetrics; coverage: { candidates: number; priced: number; tickets: number }; emptyReason: string | null } };

const emptyLabels: Record<string, string> = {
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

function Stats({ metrics, definition }: { metrics: StrategyHubMetrics; definition: CatalogItem }) {
  const all = metrics.all;
  const recent = metrics.recent;
  const noun = metrics.unit === "TICKETS" ? "tiketů" : metrics.unit === "FORECASTS" ? "prognóz" : "výběrů";
  return <>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-6">
      <Metric label="Uzavřeno" value={String(all.settled)} note={`${all.pending} čeká · ${noun}`} />
      <Metric label="Úspěšnost" value={pct(all.accuracy)} note={metrics.selectionAccuracy != null && metrics.unit === "TICKETS" ? `nohy ${pct(metrics.selectionAccuracy)}` : undefined} />
      <Metric label="Profit" value={metrics.unit === "FORECASTS" ? "—" : units(all.profit)} note="vklad 1 jednotka" />
      <Metric label="ROI" value={metrics.unit === "FORECASTS" ? "—" : pct(all.roi)} note="aktuální verze" />
      <Metric label="Průměrný kurz" value={all.averageOdds?.toFixed(2) ?? "—"} note="jen zmrazené ceny" />
      <Metric label="Posledních 30 dní" value={recent.roi == null ? "—" : pct(recent.roi)} note={`${recent.settled} uzavřeno`} />
    </div>
    {all.settled < definition.minimumSample ? <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Vzorek {all.settled}/{definition.minimumSample} zatím nestačí k potvrzení strategie.</p> : null}
    {metrics.direct && metrics.synthetic ? <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">Rozdělení VALUE podle ceny</summary><p className="mt-2">Přímé ceny: {metrics.direct.settled} uzavřeno · ROI {pct(metrics.direct.roi)}. Odhadnuté ceny: {metrics.synthetic.settled} uzavřeno · ROI {pct(metrics.synthetic.roi)}.</p></details> : null}
  </>;
}

function OpportunityCard({ item }: { item: StrategyHubOpportunity }) {
  const color = item.outcome === "WON" ? "text-positive bg-positive/10" : item.outcome === "LOST" ? "text-negative bg-negative/10" : "text-muted bg-border/50";
  return <article className="rounded-xl border border-border bg-surface p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">{item.leagueName} · {new Date(item.kickoff).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</p><h3 className="mt-1 text-sm font-bold">{item.homeName} – {item.awayName}</h3></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${color}`}>{resultLabel(item.outcome)}{item.score ? ` · ${item.score}` : ""}</span></div>
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
  const requestedDate = params.get("date");
  const minDate = shiftDate(today, -1), maxDate = shiftDate(today, 7);
  const date = requestedDate && requestedDate >= minDate && requestedDate <= maxDate ? requestedDate : today;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { setPayload(null); setError(false); }); fetch(`/api/picks/strategies?strategy=${strategy}&date=${date}`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Payload>; }).then(setPayload).catch((reason) => { if (reason?.name !== "AbortError") setError(true); }); return () => controller.abort(); }, [strategy, date]);
  const navigate = (nextStrategy: StrategyHubId, nextDate = date) => { const query = new URLSearchParams(); if (nextStrategy !== "VALUE") query.set("strategy", nextStrategy); if (nextDate !== today) query.set("date", nextDate); router.push(`${pathname}${query.size ? `?${query}` : ""}`); };
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
  const catalog = payload?.catalog ?? [];
  const definition = catalog.find((item) => item.id === strategy);
  const data = payload?.data;
  const locked = payload?.locked ?? false;
  return <><AppHeader user={user} /><main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:pt-8">
    <div><p className="page-kicker">Jedno místo pro všechny výběry</p><h1 className="page-title">Sázkové strategie</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Bilance, dnešní příležitosti a případné tikety zůstávají oddělené podle pravidel, která je vytvořila.</p></div>
    <nav aria-label="Výběr strategie" className="mt-5 -mx-4 overflow-x-auto px-4 [scrollbar-width:none]"><div className="flex min-w-max gap-2 pb-2">{catalog.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={`rounded-full border px-4 py-2 text-sm font-bold transition ${item.id === strategy ? "border-accent-strong bg-accent text-accent-ink" : "border-border bg-surface text-muted hover:text-foreground"}`}>{item.shortTitle}</button>)}</div></nav>
    {!payload && !error ? <div className="ui-panel mt-4 h-56 animate-pulse bg-border/30" /> : error ? <div className="ui-panel mt-4 p-6 text-sm text-negative">Přehled se nepodařilo načíst. Zkus stránku obnovit.</div> : definition && <>
      <section className="ui-panel mt-4 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">{definition.title}</h2><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${definition.status === "LIVE_TEST" ? "bg-positive/10 text-positive" : "bg-warning/10 text-warning"}`}>{definition.statusLabel}</span></div><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{definition.description}</p></div><span className="rounded-lg border border-border px-3 py-2 text-xs font-bold">Pravidla v{definition.policyVersion}</span></div>{data ? <Stats metrics={data.metrics} definition={definition} /> : null}</section>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"><button disabled={date <= minDate} onClick={() => navigate(strategy, shiftDate(date, -1))} className="min-h-10 rounded-lg px-3 font-bold disabled:opacity-30" aria-label="Předchozí den">←</button><label className="text-center"><span className="block text-[10px] font-bold uppercase text-muted">Herní den</span><input type="date" min={minDate} max={maxDate} value={date} onChange={(event) => navigate(strategy, event.target.value)} className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold" /><span className="ml-2 hidden text-sm capitalize sm:inline">{dateLabel(date)}</span></label><button disabled={date >= maxDate} onClick={() => navigate(strategy, shiftDate(date, 1))} className="min-h-10 rounded-lg px-3 font-bold disabled:opacity-30" aria-label="Další den">→</button></div>
      {locked ? <section className="ui-panel mt-4 border-dashed p-8 text-center"><p className="page-kicker">Obsah PRO</p><h2 className="mt-2 text-xl font-bold">Denní příležitosti a přesná bilance jsou uzamčené</h2><p className="mx-auto mt-2 max-w-xl text-sm text-muted">Veřejně vidíš princip a stav strategie. PRO zpřístupní zmrazené výběry, kurzy, výsledky a ROI.</p><button type="button" disabled={checkoutLoading} onClick={() => void unlock()} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-bold text-accent-ink disabled:opacity-60">{checkoutLoading ? "Otevírám…" : user ? "Odemknout PRO" : "Přihlásit přes Google"}</button></section> : data && <>
        <section className="mt-6"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="page-kicker">{dateLabel(date)}</p><h2 className="mt-1 text-xl font-bold">Příležitosti pro vybraný den</h2></div><p className="text-xs text-muted">{data.coverage.candidates} vybráno · {data.coverage.priced} s kurzem</p></div>
          {data.opportunities.length ? <div className="mt-3 grid gap-3 lg:grid-cols-2">{data.opportunities.map((item) => <OpportunityCard key={item.id} item={item} />)}</div> : <div className="ui-panel mt-3 border-dashed p-7 text-center"><strong className="text-base">Dnes tato strategie nic nevybrala</strong><p className="mx-auto mt-2 max-w-xl text-sm text-muted">{emptyLabels[data.emptyReason ?? ""] ?? "Nejsou dostupné kvalifikované příležitosti."}</p></div>}
        </section><Tickets tickets={data.tickets} />{!definition.accumulator && <p className="mt-4 rounded-xl bg-background p-3 text-xs text-muted">Tato strategie sleduje jednotlivé výběry a akumulační tiket neskládá.</p>}
      </>}
    </>}
    <p className="mt-8 text-center text-[11px] text-muted">Jde o prospektivní sledování modelů, nikoli doporučení vkladu. Výzkumné strategie nejsou ověřené.</p>
  </main></>;
}
