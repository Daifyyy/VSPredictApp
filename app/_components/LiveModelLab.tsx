"use client";

import { useEffect, useState } from "react";

type Row = { id: string; fixtureId: number; homeName: string; awayName: string; kickoff: string; side: string; line: number | null; minute: number; scoreHome: number; scoreAway: number; modelProbability: number; marketProbability: number; expectedValue: number; decimalOdds: number; bookmaker: string; hit: boolean | null; profit: number | null };
type Card = { market: string; title: string; status: string; currentCount: number; sample: number; hits: number; profit: number; roi: number | null; brier: number | null; maxDrawdown: number; priceCompleteness: number | null; bands: Array<{ label: string; sample: number; roi: number | null }>; current?: Row[]; recent?: Row[] };

const percentage = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} %`;

export function LiveModelLab({ isPro }: { isPro: boolean }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Card>>({});
  useEffect(() => { const controller = new AbortController(); fetch("/api/picks/model-lab/live", { signal: controller.signal }).then((r) => r.ok ? r.json() : Promise.reject()).then((data: { cards: Card[] }) => setCards(data.cards)).catch(() => setCards([])); return () => controller.abort(); }, []);
  useEffect(() => { if (!open || !isPro || detail[open]) return; const controller = new AbortController(); fetch("/api/picks/model-lab/live?detail=true", { cache: "no-store", signal: controller.signal }).then((r) => r.ok ? r.json() : Promise.reject()).then((data: { cards: Card[] }) => setDetail(Object.fromEntries(data.cards.map((card) => [card.market, card])))).catch(() => undefined); return () => controller.abort(); }, [open, isPro, detail]);
  return <section className="mt-5 border-t border-border pt-4"><div><p className="page-kicker">Prospektivní live výzkum</p><h3 className="mt-1 text-base font-bold">Experimentální live modely</h3><p className="mt-1 text-[11px] text-muted">Oddělené simulované výběry 1u po skutečném live kurzu. Nejde o ověřené sázkové systémy.</p></div>
    {!cards ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-border/50" /> : <div className="mt-3 grid gap-3 lg:grid-cols-3">{cards.map((card) => <article key={card.market} className="rounded-xl border border-border bg-background p-3"><button type="button" className="w-full text-left" aria-expanded={open === card.market} onClick={() => setOpen((value) => value === card.market ? null : card.market)}><div className="flex items-center justify-between gap-2"><strong>{card.title}</strong><span className="rounded-full bg-warning/10 px-2 py-1 text-[9px] font-bold text-warning">EXPERIMENTAL LIVE_TEST</span></div><p className="mt-2 text-[11px] text-muted">Aktuálně vybráno: {card.currentCount}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Mini label="Vzorek" value={`${card.sample}/200`} /><Mini label="ROI" value={percentage(card.roi)} /><Mini label="Brier" value={card.brier?.toFixed(3) ?? "—"} /></div></button>{open === card.market ? <LiveDetail card={detail[card.market] ?? card} isPro={isPro} /> : null}</article>)}</div>}
  </section>;
}

function LiveDetail({ card, isPro }: { card: Card; isPro: boolean }) {
  if (!isPro) return <p className="mt-3 rounded-lg bg-surface p-2 text-xs text-muted">Konkrétní live výběry jsou součástí PRO.</p>;
  if (!card.current && !card.recent) return <div className="mt-3 h-16 animate-pulse rounded-lg bg-border/50" />;
  return <div className="mt-3 space-y-3 border-t border-border pt-3 text-[11px]"><div className="grid grid-cols-2 gap-2"><Mini label="Zisk" value={`${card.profit >= 0 ? "+" : ""}${card.profit.toFixed(2)} u`} /><Mini label="Max. propad" value={`${card.maxDrawdown.toFixed(2)} u`} /></div><Rows title="Aktuální výběry" rows={card.current ?? []} /><Rows title="Poslední vyhodnocené" rows={card.recent ?? []} /><div><strong>Výkon podle minuty</strong>{card.bands.map((band) => <p key={band.label} className="mt-1 flex justify-between text-muted"><span>{band.label} · n={band.sample}</span><span>ROI {percentage(band.roi)}</span></p>)}</div></div>;
}
function Rows({ title, rows }: { title: string; rows: Row[] }) { return <div><strong>{title}</strong>{rows.length ? rows.map((row) => <p key={row.id} className="mt-1 rounded-lg border border-border p-2"><b>{row.homeName} – {row.awayName}</b><br />{row.minute}&apos; · {row.side}{row.line == null ? "" : ` ${row.line.toFixed(1)}`} · kurz {row.decimalOdds.toFixed(2)} · EV {percentage(row.expectedValue)}{row.hit == null ? "" : ` · ${row.hit ? "vyšlo" : "nevyšlo"} · ${row.profit! >= 0 ? "+" : ""}${row.profit!.toFixed(2)} u`}</p>) : <p className="mt-1 text-muted">Bez záznamů.</p>}</div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-surface px-2 py-2"><span className="block text-[9px] uppercase text-muted">{label}</span><b className="mt-1 block tabular-nums">{value}</b></div>; }
