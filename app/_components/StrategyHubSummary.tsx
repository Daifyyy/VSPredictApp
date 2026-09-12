"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionUser } from "./sessionUser";

type Summary = { activeStrategies: number; opportunities: number; tickets: number; strategies: Array<{ strategy: string; opportunities: number; tickets: number; emptyReason: string | null }> };

export function StrategyHubSummary({ date, user }: { date: string | null; user: SessionUser | null }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    if (!date || user?.tier !== "PRO") return;
    const controller = new AbortController();
    fetch(`/api/picks/strategies?summary=1&date=${encodeURIComponent(date)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then((payload) => payload?.summary && setSummary(payload.summary)).catch(() => {});
    return () => controller.abort();
  }, [date, user?.tier]);
  if (!date) return null;
  return <section className="ui-panel mt-4 overflow-hidden" aria-labelledby="strategy-summary-title">
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"><div><p className="page-kicker">Sázkové strategie</p><h2 id="strategy-summary-title" className="mt-1 text-lg font-bold">Všechny dnešní příležitosti na jednom místě</h2><p className="mt-1 text-xs text-muted">VALUE, ELO i jednotlivé modelové trhy s vlastní bilancí a výsledky.</p></div>
      {summary ? <div className="grid grid-cols-3 gap-2 text-center"><div><strong className="block text-xl">{summary.activeStrategies}</strong><span className="text-[9px] uppercase text-muted">strategií</span></div><div><strong className="block text-xl">{summary.opportunities}</strong><span className="text-[9px] uppercase text-muted">výběrů</span></div><div><strong className="block text-xl">{summary.tickets}</strong><span className="text-[9px] uppercase text-muted">tiketů</span></div></div> : <p className="text-xs text-muted">{user?.tier === "PRO" ? "Načítám dnešní souhrn…" : "Konkrétní výběry jsou součástí PRO."}</p>}
    </div><Link href={`/strategie${date ? `?date=${date}` : ""}`} className="flex min-h-11 items-center justify-between border-t border-border bg-background px-4 text-sm font-bold transition hover:bg-accent/10"><span>Zobrazit všechny strategie</span><span aria-hidden>→</span></Link>
  </section>;
}
