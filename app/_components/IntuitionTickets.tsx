"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Leg = {
  fixtureId: number; kickoff: string; homeName: string; awayName: string; winnerName: string;
  totalSide: "OVER" | "UNDER"; totalLine: number; decimalOdds: number | null;
  priceKind: "DIRECT" | "SYNTHETIC" | "NONE"; hit: boolean | null;
  homeGoals: number | null; awayGoals: number | null;
};
type Ticket = { slot: number; combinedOdds: number | null; hit: boolean | null; profit: number | null; legs: Leg[] };
type Block = {
  strategy: "VALUE" | "ELO_INTUITION"; frozen: boolean; tickets: Ticket[]; emptyReason: string | null;
  coverage: { fixtures: number; withOdds: number; candidates: number; beforeVeto?: number };
};
type Payload = { date: string; strategies: Block[] };

const emptyText: Record<string, string> = {
  WAITING_FOR_ODDS: "Čekáme na dostupné kombinované kurzy.",
  INSUFFICIENT_ELO_HISTORY: "Pro dnešní zápasy zatím chybí dostatečná Elo historie.",
  NOT_ENOUGH_VALUE_LEGS: "Dnes nejsou alespoň dvě dostatečně kvalitní VALUE příležitosti.",
  NOT_ENOUGH_CONTEXTUAL_LEGS: "Dnes nejsou alespoň dvě přesvědčivé kontextové příležitosti.",
  NOT_ENOUGH_BALANCED_LEGS: "Dnešní výběr nesplnil požadovanou rovnováhu kvality a pravděpodobnosti.",
  CONTEXT_VETO: "Dnešní Elo signály neprošly kontrolou lidského kontextu.",
};
const strategyMeta = {
  VALUE: { eyebrow: "Tržní value", title: "VALUE", tone: "bg-accent text-white", detail: "VALUE" },
  ELO_INTUITION: { eyebrow: "Kontextový experiment", title: "ELO / INTUICE", tone: "bg-foreground text-background", detail: "ELO_INTUITION" },
} as const;

function selection(leg: Leg) {
  const goals = `${leg.totalSide === "OVER" ? "více" : "méně"} než ${String(leg.totalLine).replace(".", ",")} gólu`;
  return `${leg.winnerName} + ${goals}`;
}

function Outcome({ hit }: { hit: boolean | null }) {
  const style = hit === true ? "bg-positive/10 text-positive" : hit === false ? "bg-negative/10 text-negative" : "bg-background text-muted";
  return <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${style}`}>{hit === true ? "Vyhráno" : hit === false ? "Prohráno" : "Čeká"}</span>;
}

function StrategyCard({ block, date }: { block: Block; date: string }) {
  const [slot, setSlot] = useState(1);
  const ticket = block.tickets.find((item) => item.slot === slot) ?? block.tickets[0];
  const meta = strategyMeta[block.strategy];
  const detailHref = `/strategie?strategy=${meta.detail}&date=${encodeURIComponent(date)}`;
  return <article className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
    <header className="relative overflow-hidden border-b border-border px-4 py-4">
      <div className="absolute -right-8 -top-12 size-32 rounded-full bg-accent/10 blur-2xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl text-[11px] font-black ${meta.tone}`}>{block.strategy === "VALUE" ? "V" : "E"}</span><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-muted">{meta.eyebrow}</p><h3 className="mt-0.5 truncate text-base font-black text-foreground">{meta.title}</h3></div></div>
        {ticket ? <div className="text-right"><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Kombinovaný kurz</p><p className="mt-0.5 text-2xl font-black tabular-nums text-foreground">{ticket.combinedOdds?.toFixed(2) ?? "—"}</p></div> : null}
      </div>
      {block.tickets.length > 1 ? <div className="relative mt-3 flex w-fit rounded-lg bg-background p-0.5">{block.tickets.map((item) => <button type="button" key={item.slot} onClick={() => setSlot(item.slot)} className={`rounded-md px-3 py-1 text-[10px] font-extrabold transition-colors ${item.slot === ticket?.slot ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}>Tiket {item.slot === 1 ? "A" : "B"}</button>)}</div> : null}
    </header>
    {!ticket ? <div className="flex min-h-44 flex-col items-center justify-center px-6 py-7 text-center"><span className="grid size-10 place-items-center rounded-full bg-background text-lg text-muted" aria-hidden>—</span><p className="mt-3 max-w-sm text-sm font-semibold text-foreground">{emptyText[block.emptyReason ?? ""] ?? "Tiket pro tento den nevznikl."}</p><p className="mt-1 text-[11px] text-muted">{block.coverage.candidates} kvalifikovaných z {block.coverage.fixtures} zápasů</p></div> : <>
      <ol className="divide-y divide-border">{ticket.legs.map((leg, index) => <li key={leg.fixtureId} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5">
        <span className="grid size-6 place-items-center rounded-full bg-background text-[10px] font-black text-muted">{index + 1}</span>
        <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-[10px] font-semibold text-muted">{leg.homeName} – {leg.awayName}</p>{leg.priceKind === "SYNTHETIC" ? <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[8px] font-black text-warning">ODHAD</span> : null}</div><p className="mt-1 truncate text-sm font-extrabold text-foreground">{selection(leg)}</p><p className="mt-1 text-[10px] text-muted">{new Date(leg.kickoff).toLocaleString("cs-CZ", { weekday: "short", hour: "2-digit", minute: "2-digit" })}{leg.homeGoals != null && leg.awayGoals != null ? ` · ${leg.homeGoals}:${leg.awayGoals}` : ""}</p></div>
        <div className="flex flex-col items-end gap-1.5"><strong className="text-sm tabular-nums text-foreground">{leg.decimalOdds?.toFixed(2) ?? "—"}</strong>{block.frozen ? <Outcome hit={leg.hit} /> : null}</div>
      </li>)}</ol>
      {ticket.hit != null ? <div className={`flex items-center justify-between border-t border-border px-4 py-2.5 text-xs font-bold ${ticket.hit ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}><span>{ticket.hit ? "Tiket vyhrál" : "Tiket nevyšel"}</span><span>{ticket.profit == null ? "—" : `${ticket.profit >= 0 ? "+" : ""}${ticket.profit.toFixed(2)} j`}</span></div> : null}
    </>}
    <footer className="flex items-center justify-between border-t border-border bg-background/60 px-4 py-3"><span className="text-[10px] text-muted">{ticket ? `${ticket.legs.length} výběry · ${block.frozen ? "uzamčeno" : "průběžný návrh"}` : "Bez tiketu"}</span><Link href={detailHref} className="text-xs font-extrabold text-accent-strong transition-colors hover:text-foreground">Detail strategie <span aria-hidden>→</span></Link></footer>
  </article>;
}

export function IntuitionTickets({ date }: { date: string | null }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    queueMicrotask(() => setPayload(null));
    fetch(`/api/picks/intuition-tickets?date=${encodeURIComponent(date)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() as Promise<Payload> : null).then((value) => value && setPayload(value)).catch(() => {});
    return () => controller.abort();
  }, [date]);
  if (!payload) return null;
  return <section className="mt-5" aria-labelledby="strategy-ticket-title">
    <div className="mb-3 flex items-end justify-between gap-3"><div><p className="page-kicker">Sledované strategie</p><h2 id="strategy-ticket-title" className="mt-1 text-lg font-black text-foreground">Dnešní tikety</h2></div><Link href={`/strategie?date=${encodeURIComponent(payload.date)}`} className="hidden text-xs font-bold text-muted hover:text-foreground sm:block">Všechny příležitosti →</Link></div>
    <div className="grid gap-4 lg:grid-cols-2">{payload.strategies.map((block) => <StrategyCard key={block.strategy} block={block} date={payload.date} />)}</div>
  </section>;
}
