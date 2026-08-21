"use client";

import { useEffect, useState } from "react";
import { Empty } from "./Empty";
import { TeamLogo } from "./TeamLogo";

interface Summary { total: number; pending: number; settled: number; hits: number; accuracy: number | null; staked: number; profit: number; roi: number | null; averageOdds: number | null; averageClv: number | null; clvComplete: number; maxDrawdown: number }
interface Entry { id: string; strategy: string; fixtureId: number; kickoff: string; homeName: string; awayName: string; homeLogo: string | null; awayLogo: string | null; market: string; side: string; line: number | null; modelProbability: number; marketProbability: number; edge: number; expectedValue: number | null; decimalOdds: number | null; bookmaker: string | null; sampleCount: number; reason: string; modelContext: string; hit: boolean | null; homeGoals: number | null; awayGoals: number | null; closingMarketProbability: number | null }
interface Watch extends Omit<Entry, "hit" | "homeGoals" | "awayGoals"> { status: string }
interface Payload { entries: Entry[]; watches: Watch[]; summary: Summary; strategies: Array<{ strategy: string; summary: Summary }>; european: { summary: Summary; strategies: Array<{ strategy: string; summary: Summary }> }; checklist: Summary; legacy: { total: number; status: string }; page: number; pages: number }

const LABEL: Record<string, string> = { ONE_X_TWO: "1X2 v2", OVER_25: "Over 2,5 v1", BTTS_YES: "BTTS Ano v1", CHECKLIST: "Checklist v1" };
const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} %`;

export function ModelPortfolio({ isPro }: { isPro: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!isPro) return;
    let active = true;
    fetch(`/api/tips/model-portfolio?page=${page}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("load");
      const payload = await response.json() as Payload;
      if (active) setData(payload);
    }).catch(() => active && setError(true));
    return () => { active = false; };
  }, [isPro, page]);
  if (!isPro) return <Empty>Modelové portfolio, jednotlivé výběry a simulované ROI jsou součástí PRO.</Empty>;
  if (error) return <Empty>Modelové portfolio se nepodařilo načíst.</Empty>;
  if (!data) return <div className="mt-4 h-32 animate-pulse rounded-xl bg-border/60" />;
  return <div className="mt-4 space-y-5">
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">Experimentální účetní simulace</p><h2 className="mt-1 text-lg font-semibold text-foreground">Modelové portfolio · 1 jednotka na výběr</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Nejde o skutečně podané sázky ani potvrzené doporučení. Výběr se zmrazí před výkopem a později se už nepřepisuje.</p></div><span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">malý vzorek</span></div>
      <SummaryGrid summary={data.summary} />
    </section>
    <section><h2 className="px-1 text-sm font-semibold text-foreground">Samostatné strategie</h2><div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[...data.strategies, { strategy: "CHECKLIST", summary: data.checklist }].map((item) => <StrategyCard key={item.strategy} label={LABEL[item.strategy]} summary={item.summary} />)}</div><p className="mt-2 px-1 text-[11px] text-muted">Při shodě checklistu a jiné strategie se evidují dvě nezávislé jednotky. Starší Publikované 1X2 v1: {data.legacy.total} záznamů · {data.legacy.status}; do v2 se nepřepočítávají.</p></section>
    {data.european.summary.total > 0 && <section className="rounded-xl border border-warning/30 bg-warning/5 p-4"><h2 className="text-sm font-semibold text-foreground">Evropské poháry · oddělený experiment</h2><p className="mt-1 text-xs text-muted">Pohárové výsledky se nemíchají s ligovým portfoliem.</p><SummaryGrid summary={data.european.summary} /></section>}
    <section><h2 className="px-1 text-sm font-semibold text-foreground">Automatické výběry</h2>{data.entries.length ? <div className="mt-2 space-y-2">{data.entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}</div> : <Empty>Zatím nevznikl žádný výběr splňující všechny brány.</Empty>}{data.pages > 1 && <div className="mt-3 flex items-center justify-center gap-3"><button type="button" disabled={data.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 rounded-full border border-border px-4 text-sm disabled:opacity-40">Předchozí</button><span className="text-xs text-muted">{data.page}/{data.pages}</span><button type="button" disabled={data.page >= data.pages} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-full border border-border px-4 text-sm disabled:opacity-40">Další</button></div>}</section>
    <details className="rounded-xl border border-border bg-surface"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">Sledované signály ({data.watches.length})</summary><div className="border-t border-border p-3">{data.watches.length ? <div className="space-y-2">{data.watches.map((entry) => <div key={entry.id} className="rounded-lg bg-background px-3 py-2"><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{entry.homeName} – {entry.awayName}</span><span className="shrink-0 text-muted">{LABEL[entry.strategy]}</span></div><p className="mt-1 text-xs text-muted">{entry.reason}</p></div>)}</div> : <p className="text-sm text-muted">Žádné aktuální sledované signály.</p>}</div></details>
  </div>;
}

function SummaryGrid({ summary }: { summary: Summary }) { return <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8"><Metric label="Výběry" value={String(summary.total)} /><Metric label="Bilance" value={`${summary.hits}/${summary.settled}`} /><Metric label="Úspěšnost" value={pct(summary.accuracy)} /><Metric label="ROI" value={pct(summary.roi)} /><Metric label="Zisk" value={`${summary.profit >= 0 ? "+" : ""}${summary.profit.toFixed(2)} j`} /><Metric label="Prům. kurz" value={summary.averageOdds?.toFixed(2) ?? "—"} /><Metric label="Prům. CLV" value={pct(summary.averageClv)} sub={`${summary.clvComplete} uzavření`} /><Metric label="Max. propad" value={`${summary.maxDrawdown.toFixed(2)} j`} /></div>; }
function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) { return <div className="rounded-xl border border-border bg-background px-2 py-2 text-center"><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="mt-1 font-bold tabular-nums text-foreground">{value}</div>{sub && <div className="text-[10px] text-muted">{sub}</div>}</div>; }
function StrategyCard({ label, summary }: { label: string; summary: Summary }) { return <div className="rounded-xl border border-border bg-surface p-3"><div className="font-semibold text-foreground">{label}</div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Metric label="Tipy" value={String(summary.total)} /><Metric label="Bilance" value={`${summary.hits}/${summary.settled}`} /><Metric label="ROI" value={pct(summary.roi)} /></div><p className="mt-2 text-[11px] text-muted">CLV {pct(summary.averageClv)} · čeká {summary.pending}</p></div>; }
function EntryRow({ entry }: { entry: Entry }) { const selection = entry.strategy === "ONE_X_TWO" ? (entry.side === "HOME" ? entry.homeName : entry.awayName) : entry.strategy === "OVER_25" ? "Over 2,5 gólu" : "Oba týmy skórují"; const profit = entry.hit == null || entry.decimalOdds == null ? null : entry.hit ? entry.decimalOdds - 1 : -1; return <article className="rounded-xl border border-border bg-surface p-3 shadow-sm"><div className="flex flex-wrap items-center gap-2"><TeamLogo src={entry.homeLogo ?? ""} alt={entry.homeName} size={20} /><span className="font-medium text-foreground">{entry.homeName} – {entry.awayName}</span><TeamLogo src={entry.awayLogo ?? ""} alt={entry.awayName} size={20} /><span className="ml-auto rounded-full bg-accent/30 px-2 py-1 text-[11px] font-semibold">{LABEL[entry.strategy]}</span></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted"><span className="font-semibold text-foreground">{selection}</span><span>model {(entry.modelProbability * 100).toFixed(1)} %</span><span>trh {(entry.marketProbability * 100).toFixed(1)} %</span><span>rozdíl +{(entry.edge * 100).toFixed(1)} p. b.</span><span>kurz {entry.decimalOdds?.toFixed(2) ?? "—"} {entry.bookmaker ? `· ${entry.bookmaker}` : ""}</span><span>EV {pct(entry.expectedValue)}</span></div><p className="mt-1 text-[11px] text-muted">{entry.reason}</p><div className="mt-2 flex justify-between border-t border-border pt-2 text-xs"><span>{entry.modelContext === "EURO_CUP" ? "Experimentální · Evropa" : "Ligový model"} · {entry.sampleCount} kurzové vzorky</span><span className={profit == null ? "text-muted" : profit >= 0 ? "font-semibold text-positive" : "font-semibold text-negative"}>{entry.hit == null ? "Čeká na výsledek" : `${entry.homeGoals}:${entry.awayGoals} · ${profit! >= 0 ? "+" : ""}${profit!.toFixed(2)} j`}</span></div></article>; }
