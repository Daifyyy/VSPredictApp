"use client";

import { useEffect, useState } from "react";
import { Empty } from "./Empty";
import { QuickOverviewPerformance } from "./QuickOverviewPerformance";
import { PressurePerformanceOverview, type PressurePerformanceReport } from "./PressurePerformanceOverview";
import { Badge, Tabs } from "./ui/primitives";

type Metric = { n: number; brier: number | null; logLoss: number | null; ece: number | null };
type Portfolio = { profit: number; pending: number; total: number; settled: number; hits: number; roi: number | null; averageClv: number | null; clvComplete: number; maxDrawdown: number; roiConfidence95: { low: number; high: number } | null; averagePriceClv: number | null; priceClvPositiveRate: number | null; priceClvConfidence95: { low: number; high: number } | null; coverage30: number; coverage75: number; panelCoverage: number; gateReason: string };
type Summary = { dataWarnings?: number; portfolio: Portfolio; holdout: { settled: number; roi: number | null }; probability: { model: Metric; opening: Metric; closing: Metric }; positiveClvRate: number | null; closingCompleteness: number; recommendedStatus: string; verdict: string; bankroll: Array<{ mode: string; final: number }> };
type Card = { modelVersion: number; asOf: string | null; awaitingRefresh: boolean; strategy: string; policyVersion: number; title: string; status: string; minimumSample: number; rules: string; modelContext: string; currentCount: number | null; summary: Summary; research?: { n: number; mae: number | null; bias: number | null; version: number | null } | null };
type Payload = { detailError?: string; asOf?: string | null; stale?: boolean; pressurePerformance?: PressurePerformanceReport | null; context: string; cards: Card[]; detailRows?: unknown[]; segments?: Array<{ kind: string; groups: Array<{ label: string; descriptiveOnly: boolean; portfolio: Portfolio }> }> };
type Activity = null;

const STATUS: Record<string, string> = { RESEARCH: "Výzkum", LIVE_TEST: "Živý test", CANDIDATE: "Kandidát", VALIDATED: "Ověřeno", REJECTED: "Zamítnuto", RETIRED: "Archiv" };
const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} %`;
const metric = (value: number | null) => value == null ? "—" : value.toFixed(3);
const statusTone = (status: string): "positive" | "warning" | "accent" | "neutral" | "negative" => status === "VALIDATED" ? "positive" : status === "LIVE_TEST" || status === "CANDIDATE" ? "accent" : status === "REJECTED" ? "negative" : status === "RESEARCH" ? "warning" : "neutral";

export function ModelLab({ isPro, isAdmin }: { isPro: boolean; isAdmin: boolean }) {
  const [context, setContext] = useState("LEAGUE");
  const [data, setData] = useState<Payload | null>(null);
  const [archive, setArchive] = useState(false);
  const [quickAudit, setQuickAudit] = useState(false);
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
    const [strategy, policyVersion] = selected.split(":");
    const controller = new AbortController();
    queueMicrotask(() => setDetail(null));
    void fetch(`/api/picks/model-lab?context=${context}&strategy=${strategy}&policyVersion=${policyVersion}&detail=true`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Detail se nepodařilo načíst.");
      if (!controller.signal.aborted) setDetail(body as Payload);
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setDetail({ context, cards: [], detailError: error.message });
    });
    return () => controller.abort();
  }, [selected, context, isPro]);

  const visible = data?.cards.filter(card => archive || card.status !== "RETIRED" && card.status !== "REJECTED") ?? [];
  return <section className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-panel)] sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="page-kicker">Výkonnost modelů</p><h2 className="mt-1 text-2xl font-bold">Modely a strategie na jednom místě</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Přesnost všech prognóz a bilance vybraných sázek jsou dvě různé věci. Verze ani soutěžní kontexty neslučujeme.</p></div><Tabs items={[{ value: "LEAGUE", label: "Ligy" }, { value: "EURO_CUP", label: "Evropa" }, { value: "NATIONAL", label: "Reprezentace" }]} value={context} onChange={setContext} label="Kontext modelů" /></div>
    {!error && data && <PressurePerformanceOverview report={data.pressurePerformance ?? null} context={context} />}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Simulované sázky · vklad 1 jednotka</h3><p className="mt-1 text-xs text-muted">Jen kvalifikované výběry. Kladné ROI samo o sobě nepotvrzuje výhodu.</p></div><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={archive} onChange={event => setArchive(event.target.checked)} />Zobrazit starší pravidla</label></div>
    <p className="mt-2 text-xs leading-5 text-muted">Původní Over zůstává v archivu. „Původní brána (research)“ nově sbírá stejné hranice na opravených datech; jeho bilance začíná samostatně od nuly.</p>
    {error ? <Empty>Přehled se nepodařilo načíst.</Empty> : !data ? <div className="mt-4 h-36 animate-pulse rounded-xl bg-border/60" /> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-muted"><tr><th className="py-3">Strategie / pravidla</th><th>Režim</th><th>Vyhodnoceno</th><th>Profit</th><th>ROI</th><th>Price CLV</th><th>Audit</th></tr></thead><tbody>{visible.map(card => {
      const key = `${card.strategy}:${card.policyVersion}`;
      return <tr key={key} className="border-t border-border"><td className="py-3 pr-3"><strong>{card.title}</strong><p className="mt-1 text-[10px] text-muted">Model {card.modelVersion} · pravidla {card.policyVersion}</p></td><td><Badge tone={statusTone(card.status)}>{STATUS[card.status] ?? card.status}</Badge></td><td>{card.awaitingRefresh ? "Čeká na souhrn" : card.summary.portfolio.settled}</td><td>{card.awaitingRefresh || !card.summary.portfolio.settled ? "—" : `${card.summary.portfolio.profit.toFixed(2)} j`}</td><td>{card.awaitingRefresh ? "—" : pct(card.summary.portfolio.roi)}</td><td>{card.awaitingRefresh ? "—" : pct(card.summary.portfolio.averagePriceClv)}</td><td><button type="button" className="min-h-11 px-2 font-semibold underline" aria-expanded={selected === key} onClick={() => open(card)}>{selected === key ? "Zavřít" : "Detail"}</button></td></tr>;
    })}</tbody></table></div>}
    {data?.cards.filter(card => `${card.strategy}:${card.policyVersion}` === selected).map(card => <article key={selected} className="mt-3 rounded-xl border border-border p-4"><h3 className="font-bold">{card.title}</h3><p className="mt-2 text-xs text-muted">{card.rules}</p><p className="mt-2 text-xs">{card.summary.verdict}</p><p className="mt-1 text-[10px] text-muted">{card.asOf ? `Souhrn k ${new Date(card.asOf).toLocaleString("cs-CZ")}` : "Čeká na první auditní souhrn."}</p><Detail card={card} isPro={isPro} isAdmin={isAdmin} context={context} detail={detail} activity={activity} activityError={activityError} onStatus={status => setData(current => current ? { ...current, cards: current.cards.map(item => item.strategy === card.strategy && item.policyVersion === card.policyVersion ? { ...item, status } : item) } : current)} /></article>)}
    <button type="button" className="mt-4 min-h-11 text-xs font-semibold underline" onClick={() => setQuickAudit(value => !value)} aria-expanded={quickAudit}>Rychlé přehledy · samostatný publikační audit</button>
    {quickAudit && <QuickOverviewPerformance context={context} isPro={isPro} />}
    <p className="mt-2 text-[11px] leading-5 text-muted">VALUE/ELO vedou bilanci celých tiketů zvlášť v <a href="/strategie" className="underline">Sázkových strategiích</a>. Nelze ji porovnávat s ROI jednotlivých sázek v této tabulce.</p>
  </section>;
}

function Detail({ card, isPro, isAdmin, context, detail, onStatus }: { card: Card; isPro: boolean; isAdmin: boolean; context: string; detail: Payload | null; activity?: Activity | null; activityError?: boolean; onStatus: (status: string) => void }) {
  const s = card.summary;
  return <div className="mt-3 space-y-3">{!!s.dataWarnings && <p className="rounded-lg bg-warning/10 p-3 text-xs">{s.dataWarnings} výběrů má datové varování. Původní sázková bilance zůstává zachována, ale tyto řádky nepotvrzují přesnost modelu ani CLV.</p>}<section><h4 className="text-xs font-bold">Strategie a portfolio</h4><div className="mt-2 grid grid-cols-3 gap-2"><Mini label="Bilance" value={`${s.portfolio.hits}/${s.portfolio.settled}`} /><Mini label="Holdout ROI" value={pct(s.holdout.roi)} /><Mini label="Max. propad" value={`${s.portfolio.maxDrawdown.toFixed(1)} u`} /></div>{s.portfolio.roiConfidence95 && <p className="mt-2 text-[10px] leading-4 text-muted">95% interval ROI {pct(s.portfolio.roiConfidence95.low)} až {pct(s.portfolio.roiConfidence95.high)}. Kladné krátkodobé ROI samo nepotvrzuje sázkovou výhodu.</p>}</section>
    <details className="overflow-hidden rounded-xl border border-border bg-background"><summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 py-2 text-xs font-bold">Technická diagnostika <span className="font-normal text-muted">kalibrace, CLV a segmenty</span></summary><div className="space-y-4 border-t border-border p-3">
      <section><h4 className="text-xs font-bold">Kvalita pravděpodobností</h4><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[380px] text-left text-[11px]"><thead className="text-muted"><tr><th>Zdroj</th><th>Brier</th><th>Log-loss</th><th>ECE</th><th>n</th></tr></thead><tbody>{[["Model", s.probability.model], ["Opening", s.probability.opening], ["Closing", s.probability.closing]].map(([label, value]) => { const m = value as Metric; return <tr className="border-t border-border" key={label as string}><td className="py-1">{label as string}</td><td>{metric(m.brier)}</td><td>{metric(m.logLoss)}</td><td>{metric(m.ece)}</td><td>{m.n}</td></tr>; })}</tbody></table></div></section>
      <section><h4 className="text-xs font-bold">Trh a CLV v2</h4><p className="mt-1 text-[11px] text-muted">Price CLV {pct(s.portfolio.averagePriceClv)}{s.portfolio.priceClvConfidence95 ? ` · 95% CI ${pct(s.portfolio.priceClvConfidence95.low)} až ${pct(s.portfolio.priceClvConfidence95.high)}` : ""} · closing do 30 min {pct(s.portfolio.coverage30)} · do 75 min {pct(s.portfolio.coverage75)} · panel {pct(s.portfolio.panelCoverage)}.</p><p className="mt-1 text-[10px] text-muted">Stav brány: {s.portfolio.gateReason}. Historické CLV v1 se do této metriky nemíchá.</p></section>
      <section><h4 className="text-xs font-bold">Bankroll · start 100 u</h4><div className="mt-2 grid grid-cols-3 gap-2">{s.bankroll.map((row) => <Mini key={row.mode} label={row.mode === "FLAT" ? "1 u" : row.mode === "PERCENT" ? "1 %" : "¼ Kelly"} value={`${row.final.toFixed(1)} u`} />)}</div></section>
      {!isPro ? <p className="rounded-lg bg-surface p-2 text-xs text-muted">Segmenty jsou součástí PRO.</p> : detail == null ? <div className="h-16 animate-pulse rounded-lg bg-border/60" /> : <Segments payload={detail} />}
    </div></details>
    {isAdmin && card.status !== "RETIRED" && <AdminStatus card={card} context={context} onSaved={onStatus} />}
  </div>;
}

function AdminStatus({ card, context, onSaved }: { card: Card; context: string; onSaved: (status: string) => void }) { const [status, setStatus] = useState(card.status); const [reason, setReason] = useState(""); const [message, setMessage] = useState(""); async function save() { setMessage("Ukládám…"); const response = await fetch("/api/picks/model-lab/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: card.strategy, policyVersion: card.policyVersion, modelContext: context, status, reason }) }); if (response.ok) { onSaved(status); setMessage("Stav uložen a zapsán do auditu."); setReason(""); } else setMessage("Změnu se nepodařilo uložit."); } return <section className="rounded-lg border border-warning/30 bg-warning/5 p-3"><h4 className="text-xs font-bold">Ruční rozhodnutí administrátora</h4><div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr_auto]"><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-xs">{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod změny (min. 10 znaků)" className="min-h-10 rounded-lg border border-border bg-surface px-3 text-xs" /><button type="button" disabled={reason.trim().length < 10} onClick={() => void save()} className="min-h-10 rounded-lg bg-accent px-3 text-xs font-bold disabled:opacity-40">Uložit</button></div>{message && <p className="mt-1 text-[10px] text-muted">{message}</p>}</section>; }

function Segments({ payload }: { payload: Payload }) { if (payload.detailError) return <p role="status" className="text-xs text-amber-700">{payload.detailError}</p>; return <section><h4 className="text-xs font-bold">Segmenty strategie</h4>{payload.asOf && <p className="mt-1 text-[11px] text-muted">Stav k {new Date(payload.asOf).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}</p>}{payload.stale && <p role="status" className="mt-1 text-xs text-amber-700">Starší uložený audit čeká na aktualizaci.</p>}<div className="mt-2 space-y-2">{payload.segments?.map((segment) => <details key={segment.kind} className="rounded-lg border border-border bg-background"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{segment.kind}</summary><div className="border-t border-border p-2">{segment.groups.map((group) => <p key={group.label} className="flex justify-between gap-3 py-1 text-[11px]"><span>{group.label}{group.descriptiveOnly ? " · popisné" : ""}</span><span>{group.portfolio.settled} · ROI {pct(group.portfolio.roi)} · CLV {pct(group.portfolio.averageClv)}</span></p>)}</div></details>)}</div></section>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background px-2 py-2 text-center"><div className="text-[9px] uppercase tracking-wide text-muted">{label}</div><strong className="mt-1 block text-xs tabular-nums">{value}</strong></div>; }
