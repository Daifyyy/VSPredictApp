"use client";

import { useEffect, useState } from "react";

type Leg = {
  fixtureId: number; kickoff: string; homeName: string; awayName: string; winnerName: string;
  totalSide: "OVER" | "UNDER"; totalLine: number; role: "VALUE" | "SUPPORT";
  decimalOdds: number | null; bookmaker: string | null; reason: string; risk: string;
  hit: boolean | null; homeGoals: number | null; awayGoals: number | null;
};
type Ticket = { slot: number; status: string; combinedOdds: number | null; hit: boolean | null; profit: number | null; legs: Leg[] };
type Payload = { date: string; frozen: boolean; tickets: Ticket[] };

const selection = (leg: Leg) => `${leg.winnerName} + ${leg.totalSide === "OVER" ? "více" : "méně"} než ${String(leg.totalLine).replace(".", ",")} gólu`;

export function IntuitionTickets({ date }: { date: string | null }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    queueMicrotask(() => setPayload(null));
    fetch(`/api/picks/intuition-tickets?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Payload> : null)
      .then((body) => body && setPayload(body)).catch(() => {});
    return () => controller.abort();
  }, [date]);
  if (!payload || !payload.tickets.length) return null;
  return <section className="mt-4" aria-labelledby="intuition-ticket-title">
    <div className="mb-2 flex items-end justify-between gap-3">
      <div><p className="page-kicker">Sledovaný experiment</p><h2 id="intuition-ticket-title" className="mt-1 text-base font-extrabold text-foreground">Intuitivní tiket herního okna</h2></div>
      <span className="text-[10px] text-muted">{payload.frozen ? "Uzamčeno před výkopem" : "Průběžný návrh"}</span>
    </div>
    <div className={`grid gap-3 ${payload.tickets.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {payload.tickets.map((ticket) => <article key={ticket.slot} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div><strong className="text-sm text-foreground">Tiket {ticket.slot === 1 ? "A" : "B"}</strong><p className="text-[10px] text-muted">{ticket.legs.length} unikátní zápasy · nejvýše 48 hodin</p></div>
          <div className="text-right"><strong className="block tabular-nums text-foreground">{ticket.combinedOdds == null ? "Kurz není dostupný" : `Kurz ${ticket.combinedOdds.toFixed(2)}`}</strong>{ticket.hit != null && <span className={`text-[10px] font-bold ${ticket.hit ? "text-positive" : "text-negative"}`}>{ticket.hit ? "TREFENO" : "NETREFENO"}</span>}</div>
        </div>
        <ol className="divide-y divide-border">
          {ticket.legs.map((leg) => <li key={leg.fixtureId} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] text-muted">{leg.homeName} – {leg.awayName} · {new Date(leg.kickoff).toLocaleString("cs-CZ", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</p><strong className="mt-0.5 block text-sm text-foreground">{selection(leg)}</strong></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${leg.role === "VALUE" ? "bg-warning/15 text-warning" : "bg-accent/15 text-foreground"}`}>{leg.role === "VALUE" ? "VALUE" : "OPORA"}</span></div>
            <p className="mt-1 text-[11px] text-muted">{leg.reason}</p>
            <div className="mt-1 flex justify-between gap-3 text-[10px] text-muted"><span>{leg.decimalOdds == null ? "Kombinovaný kurz bez přímé nabídky" : `${leg.decimalOdds.toFixed(2)} · ${leg.bookmaker}`}</span>{leg.hit != null && <strong className={leg.hit ? "text-positive" : "text-negative"}>{leg.homeGoals}:{leg.awayGoals} · {leg.hit ? "✓" : "✕"}</strong>}</div>
          </li>)}
        </ol>
        <p className="border-t border-border bg-background px-4 py-2 text-[10px] text-muted">Experimentální modelový výběr, nikoli doporučení vkladu. Do ROI vstupují jen přímo dostupné kombinované kurzy.</p>
      </article>)}
    </div>
  </section>;
}
