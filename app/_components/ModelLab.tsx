"use client";

import { useEffect, useState } from "react";
import { Empty } from "./Empty";
import { QuickOverviewPerformance } from "./QuickOverviewPerformance";
import { Badge, Tabs } from "./ui/primitives";

type Metric = { n: number; brier: number | null; logLoss: number | null; ece: number | null };
type Portfolio = { total: number; settled: number; hits: number; roi: number | null; averageClv: number | null; clvComplete: number; maxDrawdown: number; roiConfidence95: { low: number; high: number } | null };
type Summary = { portfolio: Portfolio; holdout: { settled: number; roi: number | null }; probability: { model: Metric; opening: Metric; closing: Metric }; positiveClvRate: number | null; closingCompleteness: number; recommendedStatus: string; verdict: string; bankroll: Array<{ mode: string; final: number }> };
type Card = { strategy: string; policyVersion: number; title: string; status: string; minimumSample: number; rules: string; modelContext: string; currentCount: number | null; summary: Summary; research?: { n: number; mae: number | null; bias: number | null; version: number | null } | null };
type Payload = { context: string; cards: Card[]; detailRows?: unknown[]; segments?: Array<{ kind: string; groups: Array<{ label: string; descriptiveOnly: boolean; portfolio: Portfolio }> }> };
type Activity = null;

const STATUS: Record<string, string> = { RESEARCH: "Výzkum", LIVE_TEST: "Živý test", CANDIDATE: "Kandidát", VALIDATED: "Ověřeno", REJECTED: "Zamítnuto", RETIRED: "Archiv" };
const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} %`;
const metric = (value: number | null) => value == null ? "—" : value.toFixed(3);
const statusTone = (status: string): "positive" | "warning" | "accent" | "neutral" | "negative" => status === "VALIDATED" ? "positive" : status === "LIVE_TEST" || status === "CANDIDATE" ? "accent" : status === "REJECTED" ? "negative" : status === "RESEARCH" ? "warning" : "neutral";

export function ModelLab({ isPro, isAdmin }: { isPro: boolean; isAdmin: boolean }) {
  const [context, setContext] = useState("LEAGUE");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Payload | null>(null);
  const activity: Activity | null = null;
  const activityError = false;
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { setData(null); setError(false); setSelected(null); setDetail(null); });
    fetch(`/api/picks/model-lab?context=${context}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("load");
      setData(await response.json() as Payload);
    }).catch((error: Error) => { if (error.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, [context]);

  function open(card: Card) {
    const key = `${card.strategy}:${card.policyVersion}`;
    if (selected === key) { setSelected(null); return; }
    setSelected(key);
  }

  useEffect(() => {
    if (!selected || !isPro) return;
    const [strategy] = selected.split(":");
    const controller = new AbortController();
    queueMicrotask(() => setDetail(null));
    void fetch(`/api/picks/model-lab?context=${context}&strategy=${strategy}&detail=true`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (response.ok) setDetail(await response.json() as Payload); }).catch(() => undefined);
    return () => controller.abort();
  }, [selected, context, isPro]);

  return <section className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-panel)] sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="page-kicker">Centrum ověřování</p><h2 className="mt-1 text-2xl font-bold text-foreground">Model Lab</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted">Kalibrace, CLV, holdout a vývoj jednotlivých verzí. Dnešní hratelné výběry jsou pouze v Sázkových strategiích.</p></div><Tabs items={[{ value: "LEAGUE", label: "Ligy" }, { value: "EURO_CUP", label: "Evropa" }, { value: "NATIONAL", label: "Reprezentace" }]} value={context} onChange={setContext} label="Kontext modelů" /></div>
    <div className="mt-5 flex items-end justify-between gap-3"><div><p className="page-kicker">Modelové politiky</p><h3 className="mt-1 text-lg font-bold">Stav ověřování</h3></div><p className="text-xs text-muted">Kliknutím otevřeš technický audit.</p></div>
    {error ? <Empty>Model Lab se nepodařilo načíst.</Empty> : !data ? <div className="mt-4 h-36 animate-pulse rounded-xl bg-border/60" /> : <div className="mt-3 grid gap-3 lg:grid-cols-2">{data.cards.map((card) => { const key = `${card.strategy}:${card.policyVersion}`; const expanded = selected === key; const sample = card.research?.n ?? card.summary.probability.model.n; const research = card.status === "RESEARCH" || card.research != null; const progress = Math.min(100, Math.round(sample / card.minimumSample * 100)); return <article key={key} className={`overflow-hidden rounded-xl border transition ${expanded ? "border-accent-strong/35 shadow-md" : "border-border hover:border-foreground/20 hover:shadow-sm"} ${card.status === "RETIRED" || card.status === "REJECTED" ? "bg-background opacity-80" : "bg-surface"}`}><button type="button" onClick={() => open(card)} className="w-full p-4 text-left" aria-expanded={expanded}><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-foreground">{card.title}</h3><p className="mt-1 text-[11px] leading-5 text-muted">{card.rules}</p></div><div className="flex items-center gap-2"><Badge tone={statusTone(card.status)}>{STATUS[card.status] ?? card.status}</Badge><span aria-hidden className={`text-muted transition ${expanded ? "rotate-180" : ""}`}>⌄</span></div></div><p className="mt-3 rounded-lg border-l-4 border-accent-strong bg-background px-3 py-2 text-xs font-medium leading-5 text-foreground">{card.summary.verdict}</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Mini label="Vzorek" value={`${sample}/${card.minimumSample}`} /><Mini label={card.research ? "MAE" : research ? "Brier" : "ROI"} value={card.research ? card.research.mae?.toFixed(2) ?? "—" : research ? metric(card.summary.probability.model.brier) : pct(card.summary.portfolio.roi)} /><Mini label={card.research ? "Bias" : research ? "Log-loss" : "CLV"} value={card.research ? card.research.bias?.toFixed(2) ?? "—" : research ? metric(card.summary.probability.model.logLoss) : pct(card.summary.portfolio.averageClv)} /><Mini label="Closing" value={`${Math.round(card.summary.closingCompleteness * 100)} %`} /></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border/70"><div className="h-full rounded-full bg-accent-strong" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-[10px] leading-4 text-muted">{research ? "Výzkumný model · ROI není ověřená metrika" : card.currentCount ? `Aktuálně vybráno: ${card.currentCount}` : "Momentálně bez výběru"} · další kontrola při n={sample < 50 ? 50 : sample < 100 ? 100 : 200}</p></button>{expanded && <div className="border-t border-border px-4 pb-4"><Detail card={card} isPro={isPro} isAdmin={isAdmin} context={context} detail={detail} activity={activity} activityError={activityError} onStatus={(status) => setData((current) => current ? { ...current, cards: current.cards.map((item) => item.strategy === card.strategy && item.policyVersion === card.policyVersion ? { ...item, status } : item) } : current)} /></div>}</article>; })}</div>}
    <QuickOverviewPerformance context={context} isPro={isPro} />
    <p className="mt-3 text-[11px] leading-5 text-muted">Nejlepší podskupina nalezená zpětně není nový důkaz. Změna pravidla musí dostat novou verzi a budoucí holdout.</p>
  </section>;
}

function Detail({ card, isPro, isAdmin, context, detail, onStatus }: { card: Card; isPro: boolean; isAdmin: boolean; context: string; detail: Payload | null; activity?: Activity | null; activityError?: boolean; onStatus: (status: string) => void }) {
  const s = card.summary;
  return <div className="mt-3 space-y-3"><section><h4 className="text-xs font-bold">Strategie a portfolio</h4><div className="mt-2 grid grid-cols-3 gap-2"><Mini label="Bilance" value={`${s.portfolio.hits}/${s.portfolio.settled}`} /><Mini label="Holdout ROI" value={pct(s.holdout.roi)} /><Mini label="Max. propad" value={`${s.portfolio.maxDrawdown.toFixed(1)} u`} /></div>{s.portfolio.roiConfidence95 && <p className="mt-2 text-[10px] leading-4 text-muted">95% interval ROI {pct(s.portfolio.roiConfidence95.low)} až {pct(s.portfolio.roiConfidence95.high)}. Kladné krátkodobé ROI samo nepotvrzuje sázkovou výhodu.</p>}</section>
    <details className="overflow-hidden rounded-xl border border-border bg-background"><summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 py-2 text-xs font-bold">Technická diagnostika <span className="font-normal text-muted">kalibrace, CLV a segmenty</span></summary><div className="space-y-4 border-t border-border p-3">
      <section><h4 className="text-xs font-bold">Kvalita pravděpodobností</h4><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[380px] text-left text-[11px]"><thead className="text-muted"><tr><th>Zdroj</th><th>Brier</th><th>Log-loss</th><th>ECE</th><th>n</th></tr></thead><tbody>{[["Model", s.probability.model], ["Opening", s.probability.opening], ["Closing", s.probability.closing]].map(([label, value]) => { const m = value as Metric; return <tr className="border-t border-border" key={label as string}><td className="py-1">{label as string}</td><td>{metric(m.brier)}</td><td>{metric(m.logLoss)}</td><td>{metric(m.ece)}</td><td>{m.n}</td></tr>; })}</tbody></table></div></section>
      <section><h4 className="text-xs font-bold">Trh a CLV</h4><p className="mt-1 text-[11px] text-muted">Kladné CLV {pct(s.positiveClvRate)} · čerstvý closing {s.portfolio.clvComplete}/{s.portfolio.total}.</p></section>
      <section><h4 className="text-xs font-bold">Bankroll · start 100 u</h4><div className="mt-2 grid grid-cols-3 gap-2">{s.bankroll.map((row) => <Mini key={row.mode} label={row.mode === "FLAT" ? "1 u" : row.mode === "PERCENT" ? "1 %" : "¼ Kelly"} value={`${row.final.toFixed(1)} u`} />)}</div></section>
      {!isPro ? <p className="rounded-lg bg-surface p-2 text-xs text-muted">Segmenty jsou součástí PRO.</p> : detail == null ? <div className="h-16 animate-pulse rounded-lg bg-border/60" /> : <Segments payload={detail} />}
    </div></details>
    {isAdmin && <AdminStatus card={card} context={context} onSaved={onStatus} />}
  </div>;
}

function AdminStatus({ card, context, onSaved }: { card: Card; context: string; onSaved: (status: string) => void }) { const [status, setStatus] = useState(card.status); const [reason, setReason] = useState(""); const [message, setMessage] = useState(""); async function save() { setMessage("Ukládám…"); const response = await fetch("/api/picks/model-lab/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: card.strategy, policyVersion: card.policyVersion, modelContext: context, status, reason }) }); if (response.ok) { onSaved(status); setMessage("Stav uložen a zapsán do auditu."); setReason(""); } else setMessage("Změnu se nepodařilo uložit."); } return <section className="rounded-lg border border-warning/30 bg-warning/5 p-3"><h4 className="text-xs font-bold">Ruční rozhodnutí administrátora</h4><div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr_auto]"><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-xs">{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod změny (min. 10 znaků)" className="min-h-10 rounded-lg border border-border bg-surface px-3 text-xs" /><button type="button" disabled={reason.trim().length < 10} onClick={() => void save()} className="min-h-10 rounded-lg bg-accent px-3 text-xs font-bold disabled:opacity-40">Uložit</button></div>{message && <p className="mt-1 text-[10px] text-muted">{message}</p>}</section>; }

function Segments({ payload }: { payload: Payload }) { return <section><h4 className="text-xs font-bold">Segmenty strategie</h4><div className="mt-2 space-y-2">{payload.segments?.map((segment) => <details key={segment.kind} className="rounded-lg border border-border bg-background"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{segment.kind}</summary><div className="border-t border-border p-2">{segment.groups.map((group) => <p key={group.label} className="flex justify-between gap-3 py-1 text-[11px]"><span>{group.label}{group.descriptiveOnly ? " · popisné" : ""}</span><span>{group.portfolio.settled} · ROI {pct(group.portfolio.roi)} · CLV {pct(group.portfolio.averageClv)}</span></p>)}</div></details>)}</div></section>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background px-2 py-2 text-center"><div className="text-[9px] uppercase tracking-wide text-muted">{label}</div><strong className="mt-1 block text-xs tabular-nums">{value}</strong></div>; }
