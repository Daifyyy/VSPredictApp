"use client";

import { useEffect, useRef, useState } from "react";

type Summary = { total: number; pending: number; settled: number; hits: number; accuracy: number | null; staked: number; profit: number; roi: number | null; averageOdds: number | null; averageClv: number | null; clvComplete: number; maxDrawdown: number; roiConfidence95: { low: number; high: number } | null; pricedSettled: number; positiveClvRate: number | null; closingCompleteness: number };
type Card = { category: string; policyVersion: number; summary: Summary };
type LedgerRow = { id: string; fixtureId: number; homeName: string; awayName: string; kickoff: string; hit: boolean | null; decimalOdds: number | null; profit: number | null; freshClosingProbability: number | null; clv: number | null };
const LABELS: Record<string, string> = { "1x2": "Výsledek 1X2", goals: "Góly Over/Under 2,5", btts: "Oba týmy skórují", corners: "Rohy", cards: "Karty" };

export function QuickOverviewPerformance({ context, isPro }: { context: string; isPro: boolean }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const ledgerRequest = useRef<AbortController | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ result: "", clv: "", leagueId: "", from: "", to: "" });
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { setCards(null); setSelected(null); setRows(null); setNotice(null); setAsOf(null); } });
    fetch(`/api/picks/quick-overview/performance?context=${context}`).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Výkonnost není dostupná.");
      return body;
    }).then(body => {
      if (!active) return;
      setCards(body.cards ?? []); setAsOf(body.asOf ?? null);
      setNotice(body.stale ? "Zobrazen je starší uložený souhrn. Čeká na aktualizaci." : null);
    }).catch(error => {
      if (active) { setCards([]); setNotice(error instanceof Error ? error.message : "Výkonnost není dostupná."); }
    });
    return () => { active = false; ledgerRequest.current?.abort(); };
  }, [context]);
  function load(category: string, force = false) {
    if (!force && selected === category) { ledgerRequest.current?.abort(); setSelected(null); setRows(null); return; }
    setSelected(category); setRows(null); setNextCursor(null); setLedgerError(null);
    if (!isPro) return;
    void fetchLedger(category, null, false);
  }
  async function fetchLedger(category: string, cursor: string | null, append: boolean) {
    ledgerRequest.current?.abort();
    const controller = new AbortController();
    ledgerRequest.current = controller;
    setLedgerError(null); setLedgerBusy(true);
    const query = new URLSearchParams({ category, context });
    if (filters.result) query.set("result", filters.result);
    if (filters.clv) query.set("clv", filters.clv);
    if (filters.leagueId) query.set("leagueId", filters.leagueId);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (cursor) query.set("cursor", cursor);
    try {
      const response = await fetch(`/api/picks/quick-overview/ledger?${query}`, { cache: 'no-store', signal: controller.signal });
      const body = await response.json() as { rows?: LedgerRow[]; nextCursor?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Historii se nepodařilo načíst.');
      if (controller.signal.aborted) return;
      setRows(current => append ? [...(current ?? []), ...(body.rows ?? [])] : body.rows ?? []);
      setNextCursor(body.nextCursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted) setLedgerError(error instanceof Error ? error.message : 'Historie není dostupná.');
    } finally {
      if (!controller.signal.aborted) setLedgerBusy(false);
    }
  }
  return <section className="mt-5 border-t border-border pt-4"><div><p className="page-kicker">Výzkumné strategie</p><h3 className="mt-1 text-base font-bold">Výkonnost rychlého přehledu</h3><p className="mt-1 text-[11px] text-muted">Každá kategorie se měří samostatně od verze v2. Nejde o ověřené sázkové doporučení.</p></div>
    {asOf && <p className="mt-2 text-[11px] text-muted">Stav k {new Date(asOf).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}</p>}
    {notice && <p className="mt-2 text-xs text-amber-700" role="status">{notice}</p>}
    {!cards ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-border/55" /> : <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">{cards.map((card) => <article key={card.category} className={`rounded-xl border border-border bg-background p-3 ${selected === card.category ? "md:col-span-2 xl:col-span-5" : ""}`}><button type="button" className="w-full text-left" onClick={() => load(card.category)} aria-expanded={selected === card.category}><strong className="text-xs">{LABELS[card.category]}</strong><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Bilance" value={`${card.summary.hits}/${card.summary.settled}`} /><Metric label="ROI" value={pct(card.summary.roi)} /><Metric label="CLV" value={pp(card.summary.averageClv)} /><Metric label="Oceněno" value={`${card.summary.pricedSettled}/${card.summary.settled}`} /></div></button>{selected === card.category && <Ledger rows={rows} error={ledgerError} busy={ledgerBusy} isPro={isPro} filters={filters} setFilters={setFilters} reload={() => load(card.category, true)} loadMore={nextCursor ? () => void fetchLedger(card.category, nextCursor, true) : null} />}</article>)}</div>}
  </section>;
}

function Ledger({ rows, error, busy, isPro, filters, setFilters, reload, loadMore }: { rows: LedgerRow[] | null; error: string | null; busy: boolean; isPro: boolean; filters: { result: string; clv: string; leagueId: string; from: string; to: string }; setFilters: (value: { result: string; clv: string; leagueId: string; from: string; to: string }) => void; reload: () => void; loadMore: (() => void) | null }) {
  if (!isPro) return <p className="mt-3 border-t border-border pt-3 text-[10px] text-muted">Konkrétní zápasy a kurzová historie jsou součástí PRO.</p>;
  return <div className="mt-3 border-t border-border pt-3 xl:col-span-5"><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5"><select aria-label="Výsledek" value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]"><option value="">Všechny výsledky</option><option value="hit">Vyšlo</option><option value="miss">Nevyšlo</option></select><select aria-label="CLV" value={filters.clv} onChange={(event) => setFilters({ ...filters, clv: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]"><option value="">Všechna CLV</option><option value="positive">Kladné CLV</option><option value="negative">Záporné CLV</option></select><input aria-label="ID soutěže" inputMode="numeric" placeholder="ID soutěže" value={filters.leagueId} onChange={(event) => setFilters({ ...filters, leagueId: event.target.value.replace(/\D/g, "") })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]" /><input aria-label="Datum od" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]" /><input aria-label="Datum do" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]" /></div><button type="button" onClick={reload} disabled={busy} className="mt-2 text-[10px] font-bold text-accent-strong">Použít filtry</button>{error && <p role="alert" className="mt-2 text-xs text-amber-700">{error}</p>}{rows == null ? error ? null : <div className="mt-2 h-12 animate-pulse rounded-lg bg-border/55" /> : rows.length ? <><div className="mt-2 space-y-1">{rows.map((row) => <div key={row.id} className="rounded-lg bg-surface px-2 py-2 text-[10px]"><strong>{row.homeName} – {row.awayName}</strong><span className="ml-2 text-muted">{row.hit == null ? "čeká" : row.hit ? "vyšlo" : "nevyšlo"} · kurz {row.decimalOdds?.toFixed(2) ?? "—"} · zisk {row.profit == null ? "—" : `${row.profit >= 0 ? "+" : ""}${row.profit.toFixed(2)} u`} · CLV {pp(row.clv)}</span></div>)}</div></> : <p className="mt-2 text-[10px] text-muted">{loadMore ? "V této části historie není shoda. Lze pokračovat dál." : "Filtru neodpovídá žádný výběr."}</p>}{loadMore && <button type="button" onClick={loadMore} disabled={busy} className="mt-2 text-[10px] font-bold text-accent-strong">{busy ? "Načítání…" : "Načíst další"}</button>}</div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><span className="block text-[9px] uppercase text-muted">{label}</span><strong className="text-xs tabular-nums">{value}</strong></div>; }
function pct(value: number | null) { return value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} %`; }
function pp(value: number | null) { return value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} p. b.`; }
