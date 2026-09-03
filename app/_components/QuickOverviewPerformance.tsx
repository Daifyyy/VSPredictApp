"use client";

import { useEffect, useState } from "react";

type Summary = { total: number; pending: number; settled: number; hits: number; accuracy: number | null; staked: number; profit: number; roi: number | null; averageOdds: number | null; averageClv: number | null; clvComplete: number; maxDrawdown: number; roiConfidence95: { low: number; high: number } | null; pricedSettled: number; positiveClvRate: number | null; closingCompleteness: number };
type Card = { category: string; policyVersion: number; summary: Summary };
type LedgerRow = { id: string; fixtureId: number; homeName: string; awayName: string; kickoff: string; hit: boolean | null; decimalOdds: number | null; profit: number | null; freshClosingProbability: number | null; clv: number | null };
const LABELS: Record<string, string> = { "1x2": "Výsledek 1X2", goals: "Góly Over/Under 2,5", btts: "Oba týmy skórují", corners: "Rohy", cards: "Karty" };

export function QuickOverviewPerformance({ context, isPro }: { context: string; isPro: boolean }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ result: "", clv: "", leagueId: "", from: "", to: "" });
  useEffect(() => { let active = true; queueMicrotask(() => { setCards(null); setSelected(null); setRows(null); }); fetch(`/api/picks/quick-overview/performance?context=${context}`).then(async (response) => response.ok ? response.json() : null).then((body) => { if (active) setCards(body?.cards ?? []); }).catch(() => active && setCards([])); return () => { active = false; }; }, [context]);
  function load(category: string, force = false) {
    if (!force && selected === category) { setSelected(null); setRows(null); return; }
    setSelected(category); setRows(null);
    if (!isPro) return;
    void fetchLedger(category, null, false);
  }
  async function fetchLedger(category: string, cursor: string | null, append: boolean) {
    const query = new URLSearchParams({ category, context });
    if (filters.result) query.set("result", filters.result);
    if (filters.clv) query.set("clv", filters.clv);
    if (filters.leagueId) query.set("leagueId", filters.leagueId);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (cursor) query.set("cursor", cursor);
    try { const response = await fetch(`/api/picks/quick-overview/ledger?${query}`, { cache: "no-store" }); const body = response.ok ? await response.json() as { rows?: LedgerRow[]; nextCursor?: string | null } : null; setRows((current) => append ? [...(current ?? []), ...(body?.rows ?? [])] : body?.rows ?? []); setNextCursor(body?.nextCursor ?? null); } catch { setRows((current) => append ? current ?? [] : []); setNextCursor(null); }
  }
  return <section className="mt-5 border-t border-border pt-4"><div><p className="page-kicker">Výzkumné strategie</p><h3 className="mt-1 text-base font-bold">Výkonnost rychlého přehledu</h3><p className="mt-1 text-[11px] text-muted">Každá kategorie se měří samostatně od verze v2. Nejde o ověřené sázkové doporučení.</p></div>
    {!cards ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-border/55" /> : <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">{cards.map((card) => <article key={card.category} className={`rounded-xl border border-border bg-background p-3 ${selected === card.category ? "md:col-span-2 xl:col-span-5" : ""}`}><button type="button" className="w-full text-left" onClick={() => load(card.category)} aria-expanded={selected === card.category}><strong className="text-xs">{LABELS[card.category]}</strong><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Bilance" value={`${card.summary.hits}/${card.summary.settled}`} /><Metric label="ROI" value={pct(card.summary.roi)} /><Metric label="CLV" value={pp(card.summary.averageClv)} /><Metric label="Oceněno" value={`${card.summary.pricedSettled}/${card.summary.settled}`} /></div></button>{selected === card.category && <Ledger rows={rows} isPro={isPro} filters={filters} setFilters={setFilters} reload={() => load(card.category, true)} loadMore={nextCursor ? () => void fetchLedger(card.category, nextCursor, true) : null} />}</article>)}</div>}
  </section>;
}

function Ledger({ rows, isPro, filters, setFilters, reload, loadMore }: { rows: LedgerRow[] | null; isPro: boolean; filters: { result: string; clv: string; leagueId: string; from: string; to: string }; setFilters: (value: { result: string; clv: string; leagueId: string; from: string; to: string }) => void; reload: () => void; loadMore: (() => void) | null }) {
  if (!isPro) return <p className="mt-3 border-t border-border pt-3 text-[10px] text-muted">Konkrétní zápasy a kurzová historie jsou součástí PRO.</p>;
  return <div className="mt-3 border-t border-border pt-3 xl:col-span-5"><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5"><select aria-label="Výsledek" value={filters.result} onChange={(event) => setFilters({ ...filters, result: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]"><option value="">Všechny výsledky</option><option value="hit">Vyšlo</option><option value="miss">Nevyšlo</option></select><select aria-label="CLV" value={filters.clv} onChange={(event) => setFilters({ ...filters, clv: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]"><option value="">Všechna CLV</option><option value="positive">Kladné CLV</option><option value="negative">Záporné CLV</option></select><input aria-label="ID soutěže" inputMode="numeric" placeholder="ID soutěže" value={filters.leagueId} onChange={(event) => setFilters({ ...filters, leagueId: event.target.value.replace(/\D/g, "") })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]" /><input aria-label="Datum od" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]" /><input aria-label="Datum do" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-lg border border-border bg-surface px-2 py-2 text-[10px]" /></div><button type="button" onClick={reload} className="mt-2 text-[10px] font-bold text-accent-strong">Použít filtry</button>{rows == null ? <div className="mt-2 h-12 animate-pulse rounded-lg bg-border/55" /> : rows.length ? <><div className="mt-2 space-y-1">{rows.map((row) => <div key={row.id} className="rounded-lg bg-surface px-2 py-2 text-[10px]"><strong>{row.homeName} – {row.awayName}</strong><span className="ml-2 text-muted">{row.hit == null ? "čeká" : row.hit ? "vyšlo" : "nevyšlo"} · kurz {row.decimalOdds?.toFixed(2) ?? "—"} · zisk {row.profit == null ? "—" : `${row.profit >= 0 ? "+" : ""}${row.profit.toFixed(2)} u`} · CLV {pp(row.clv)}</span></div>)}</div>{loadMore && <button type="button" onClick={loadMore} className="mt-2 text-[10px] font-bold text-accent-strong">Načíst další</button>}</> : <p className="mt-2 text-[10px] text-muted">Filtru neodpovídá žádný výběr.</p>}</div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><span className="block text-[9px] uppercase text-muted">{label}</span><strong className="text-xs tabular-nums">{value}</strong></div>; }
function pct(value: number | null) { return value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} %`; }
function pp(value: number | null) { return value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} p. b.`; }
