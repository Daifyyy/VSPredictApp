"use client";

import { useEffect, useState } from "react";

type Leg = {
  fixtureId: number; kickoff: string; homeName: string; awayName: string; winnerName: string;
  totalSide: "OVER" | "UNDER"; totalLine: number; role: string; decimalOdds: number | null;
  bookmaker: string | null; reason: string; risk: string; eloExpectedValue?: number | null;
  modelExpectedValue?: number | null; priceKind: "DIRECT" | "SYNTHETIC" | "NONE";
  pedigreeScore?: number | null; contextScore?: number | null; contextSupports?: string[];
  hit: boolean | null; homeGoals: number | null; awayGoals: number | null;
};
type Ticket = {
  slot: number; combinedOdds: number | null; naturalCombinedOdds?: number | null; estimatedPriceCount?: number; hit: boolean | null; profit: number | null; legs: Leg[];
};
type Block = {
  strategy: "VALUE" | "ELO_INTUITION"; frozen: boolean; tickets: Ticket[]; emptyReason: string | null;
  coverage: { fixtures: number; withOdds: number; candidates: number; beforeVeto?: number };
  vetoes?: string[];
};
type Payload = { date: string; strategies: Block[] };

const emptyText: Record<string, string> = {
  WAITING_FOR_ODDS: "Čekáme na přímé kombinované kurzy.",
  INSUFFICIENT_ELO_HISTORY: "Týmy zatím nemají požadovaných 10 LONG a 5 FAST zápasů.",
  NOT_ENOUGH_VALUE_LEGS: "Dnes nejsou alespoň tři samostatně kvalitní VALUE nohy.",
  NOT_ENOUGH_CONTEXTUAL_LEGS: "Dnes nejsou alespoň tři lidsky obhajitelné ELO příležitosti.",
  NOT_ENOUGH_BALANCED_LEGS: "Kandidáti existují, ale chybí alespoň dvě nosné nohy typu favorit + góly. Tiket z více drahých outsiderů neskládáme.",
  CONTEXT_VETO: "Elo signály existují, ale dostupný lidský kontext je vetoval.",
};
const selection = (leg: Leg) => `${leg.winnerName} + ${leg.totalSide === "OVER" ? "více" : "méně"} než ${String(leg.totalLine).replace(".", ",")} gólu`;

function Outcome({ hit, pending = "Čeká" }: { hit: boolean | null; pending?: string }) {
  const style = hit === true ? "bg-positive/10 text-positive" : hit === false ? "bg-negative/10 text-negative" : "bg-border/60 text-muted";
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold ${style}`}>{hit === true ? "VYŠLO" : hit === false ? "NEVYŠLO" : pending.toUpperCase()}</span>;
}

function StrategyCard({ block, conflicts }: { block: Block; conflicts: Map<number, string> }) {
  const [slot, setSlot] = useState(1);
  const ticket = block.tickets.find((item) => item.slot === slot) ?? block.tickets[0];
  const settled = ticket?.legs.filter((leg) => leg.hit != null).length ?? 0;
  return <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div><p className="page-kicker">{block.strategy === "VALUE" ? "Tržní value" : "Oddělený experiment"}</p><strong className="text-sm text-foreground">{block.strategy === "VALUE" ? "Přísný VALUE tiket" : "Experimentální ELO/INTUICE"}</strong></div>
      {block.tickets.length > 1 && <div className="flex rounded-lg border border-border p-0.5">{block.tickets.map((item) => <button key={item.slot} onClick={() => setSlot(item.slot)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${item.slot === ticket?.slot ? "bg-accent text-white" : "text-muted"}`}>{item.slot === 1 ? "A" : "B"}</button>)}</div>}
    </div>
    {!ticket ? <div className="px-4 py-5"><p className="text-sm text-foreground">{emptyText[block.emptyReason ?? ""] ?? "Tiket pro toto okno nevznikl."}</p><p className="mt-1 text-[11px] text-muted">{block.coverage.withOdds}/{block.coverage.fixtures} zápasů s kurzem · před kontextem {block.coverage.beforeVeto ?? block.coverage.candidates} · po filtrech {block.coverage.candidates}</p>{block.vetoes?.length ? <p className="mt-2 text-[10px] text-negative">Veta: {block.vetoes.join("; ")}</p> : null}</div> : <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-[11px] text-muted">
        <span>{block.frozen ? "Uzamčeno" : "Průběžný návrh"} · tiket {ticket.slot === 1 ? "A" : "B"}</span>
        <div className="flex items-center gap-2"><strong className="text-foreground">Kurz {ticket.combinedOdds?.toFixed(2) ?? "—"}</strong>{block.frozen && <Outcome hit={ticket.hit} pending={settled ? `${settled}/${ticket.legs.length}` : "Čeká"} />}</div>
      </div>
      <ol className="divide-y divide-border">{ticket.legs.map((leg) => <li key={leg.fixtureId} className="px-4 py-3">
        <div className="flex items-start justify-between gap-3"><p className="truncate text-[10px] text-muted">{leg.homeName} – {leg.awayName} · {new Date(leg.kickoff).toLocaleString("cs-CZ", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</p>{block.frozen && <Outcome hit={leg.hit} />}</div>
        <div className="mt-0.5 flex justify-between gap-3"><strong className="text-sm text-foreground">{selection(leg)}</strong><span className="rounded-full bg-accent/15 px-2 py-1 text-[9px] font-bold">{leg.role === "SUPPORT" ? "OPORA" : leg.role}</span></div>
        {conflicts.has(leg.fixtureId) && <p className="mt-1 rounded-md bg-warning/10 px-2 py-1 text-[10px] font-bold text-warning">Rozpor strategií: {conflicts.get(leg.fixtureId)}</p>}
        {leg.homeGoals != null && leg.awayGoals != null && <p className={`mt-1 text-[11px] font-bold ${leg.hit ? "text-positive" : "text-negative"}`}>Výsledek {leg.homeGoals}:{leg.awayGoals}</p>}
        <p className="mt-1 text-[11px] text-muted">{leg.reason}</p>
        {leg.contextSupports?.length ? <p className="mt-1 text-[10px] text-positive">Podpora: {leg.contextSupports.join(" · ")}</p> : null}
        <p className="mt-1 text-[10px] text-muted">Riziko: {leg.risk}</p>
        <p className="mt-1 text-[10px] text-muted">{leg.decimalOdds?.toFixed(2)} · {leg.bookmaker} · {leg.priceKind === "SYNTHETIC" ? "ODHAD CENY" : "PŘÍMÝ KURZ"}{leg.modelExpectedValue != null ? ` · model EV ${(leg.modelExpectedValue * 100).toFixed(1)} %` : ""}{block.strategy === "ELO_INTUITION" && leg.eloExpectedValue != null ? ` · Elo EV ${(leg.eloExpectedValue * 100).toFixed(1)} %` : ""}{leg.pedigreeScore != null ? ` · pedigree ${Math.round(leg.pedigreeScore * 100)}` : ""}{leg.contextScore != null ? ` · kontext ${leg.contextScore >= 0 ? "+" : ""}${leg.contextScore}` : ""}</p>
      </li>)}</ol>
      {ticket.hit != null && <div className={`flex justify-between border-t border-border px-4 py-2 text-[11px] font-bold ${ticket.hit ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}><span>{ticket.hit ? "Tiket vyšel" : "Tiket nevyšel"}</span><span>{ticket.profit == null ? "Zisk —" : `${ticket.profit >= 0 ? "+" : ""}${ticket.profit.toFixed(2)} j`}</span></div>}
    </>}
    <p className="border-t border-border bg-background px-4 py-2 text-[10px] text-muted">Sledovaný modelový výběr, nikoli doporučení vkladu. Výsledky strategií se vyhodnocují odděleně.</p>
  </article>
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
  const selections = new Map<number, Array<{ strategy: Block["strategy"]; winnerName: string }>>();
  for (const block of payload.strategies) for (const ticket of block.tickets) for (const leg of ticket.legs) {
    const values = selections.get(leg.fixtureId) ?? [];
    if (!values.some((item) => item.strategy === block.strategy)) values.push({ strategy: block.strategy, winnerName: leg.winnerName });
    selections.set(leg.fixtureId, values);
  }
  const conflicts = new Map([...selections].flatMap(([fixtureId, values]) => new Set(values.map((item) => item.winnerName)).size > 1
    ? [[fixtureId, values.map((item) => `${item.strategy === "VALUE" ? "VALUE" : "ELO"} → ${item.winnerName}`).join(" · ")] as const]
    : []));
  return <section className="mt-4" aria-labelledby="strategy-ticket-title"><div className="mb-2"><p className="page-kicker">Sledované strategie</p><h2 id="strategy-ticket-title" className="mt-1 text-base font-extrabold text-foreground">Tikety herního okna</h2></div><div className="grid gap-3 lg:grid-cols-2">{payload.strategies.map((block) => <StrategyCard key={block.strategy} block={block} conflicts={conflicts} />)}</div></section>;
}
