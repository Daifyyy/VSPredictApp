"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Empty } from "./Empty";
import { QuickOverviewPerformance } from "./QuickOverviewPerformance";
import { TeamLogo } from "./TeamLogo";

type Metric = { n: number; brier: number | null; logLoss: number | null; ece: number | null };
type Portfolio = { total: number; settled: number; hits: number; roi: number | null; averageClv: number | null; clvComplete: number; maxDrawdown: number; roiConfidence95: { low: number; high: number } | null };
type Summary = { portfolio: Portfolio; holdout: { settled: number; roi: number | null }; probability: { model: Metric; opening: Metric; closing: Metric }; positiveClvRate: number | null; closingCompleteness: number; recommendedStatus: string; verdict: string; bankroll: Array<{ mode: string; final: number }> };
type Card = { strategy: string; policyVersion: number; title: string; status: string; minimumSample: number; rules: string; modelContext: string; currentCount: number | null; summary: Summary; research?: { n: number; mae: number | null; bias: number | null; version: number | null } | null };
type Payload = { context: string; cards: Card[]; detailRows?: unknown[]; segments?: Array<{ kind: string; groups: Array<{ label: string; descriptiveOnly: boolean; portfolio: Portfolio }> }> };
type ActivityRow = { id: string; fixtureId: number; leagueId: number; leagueName: string; kickoff: string; homeTeamId: number; awayTeamId: number; homeName: string; awayName: string; homeLogo: string | null; awayLogo: string | null; market: string; side: string; line: number | null; modelProbability: number; marketProbability: number; edge: number; expectedValue: number | null; decimalOdds: number | null; bookmaker: string | null; qualifiedAt: string | null; activityState: "waiting" | "live"; resultStatus: string | null; homeGoals: number | null; awayGoals: number | null; hit: boolean | null; profit: number | null; freshClosingProbability: number | null; clv: number | null };
type Activity = { kind: "autonomous" | "research" | "unavailable"; current: ActivityRow[]; recent: ActivityRow[] };

const STATUS: Record<string, string> = { RESEARCH: "Výzkum", LIVE_TEST: "Živý test", CANDIDATE: "Kandidát", VALIDATED: "Ověřeno", REJECTED: "Zamítnuto", RETIRED: "Archiv" };
const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} %`;
const metric = (value: number | null) => value == null ? "—" : value.toFixed(3);

export function ModelLab({ isPro, isAdmin }: { isPro: boolean; isAdmin: boolean }) {
  const [context, setContext] = useState("LEAGUE");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Payload | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityError, setActivityError] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { setData(null); setError(false); setSelected(null); setDetail(null); });
    fetch(`/api/picks/model-lab?context=${context}`).then(async (response) => {
      if (!response.ok) throw new Error("load");
      if (active) setData(await response.json() as Payload);
    }).catch(() => active && setError(true));
    return () => { active = false; };
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
    queueMicrotask(() => { setDetail(null); setActivity(null); setActivityError(false); });
    void Promise.all([
      fetch(`/api/picks/model-lab?context=${context}&strategy=${strategy}&detail=true`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (response.ok) setDetail(await response.json() as Payload); }),
      fetch(`/api/picks/model-lab/activity?context=${context}&strategy=${strategy}&policyVersion=${policyVersion}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("activity"); setActivity(await response.json() as Activity); }).catch((error: Error) => { if (error.name !== "AbortError") setActivityError(true); }),
    ]).catch(() => undefined);
    return () => controller.abort();
  }, [selected, context, isPro]);

  return <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="page-kicker">Centrum ověřování</p><h2 className="mt-1 text-xl font-bold text-foreground">Model Lab</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted">Kalibrace, benchmark trhu, CLV a neměnné portfolio v jednom pohledu. Doporučení nikdy samo nezmění stav strategie.</p></div><div className="flex rounded-xl border border-border bg-background p-1">{[["LEAGUE", "Ligy"], ["EURO_CUP", "Evropa"], ["NATIONAL", "Reprezentace"]].map(([value, label]) => <button type="button" key={value} onClick={() => setContext(value)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${context === value ? "bg-accent text-foreground" : "text-muted"}`}>{label}</button>)}</div></div>
    {error ? <Empty>Model Lab se nepodařilo načíst.</Empty> : !data ? <div className="mt-4 h-36 animate-pulse rounded-xl bg-border/60" /> : <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.cards.map((card) => { const key = `${card.strategy}:${card.policyVersion}`; const expanded = selected === key; const sample = card.research?.n ?? card.summary.portfolio.settled; return <article key={key} className={`rounded-xl border border-border p-3 ${card.status === "RETIRED" || card.status === "REJECTED" ? "bg-background opacity-80" : "bg-surface"}`}><button type="button" onClick={() => open(card)} className="w-full text-left" aria-expanded={expanded}><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-foreground">{card.title}</h3><p className="mt-1 text-[11px] text-muted">{card.rules}</p></div><span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-bold text-foreground">{STATUS[card.status] ?? card.status}</span></div><p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs font-medium text-foreground">{card.summary.verdict}</p><div className="mt-3 grid grid-cols-4 gap-2"><Mini label="Vzorek" value={`${sample}/${card.minimumSample}`} /><Mini label={card.research ? "MAE" : "ROI"} value={card.research ? card.research.mae?.toFixed(2) ?? "—" : pct(card.summary.portfolio.roi)} /><Mini label={card.research ? "Bias" : "CLV"} value={card.research ? card.research.bias?.toFixed(2) ?? "—" : pct(card.summary.portfolio.averageClv)} /><Mini label="Closing" value={`${Math.round(card.summary.closingCompleteness * 100)} %`} /></div><p className="mt-2 text-[10px] text-muted">{card.currentCount == null ? card.status === "RESEARCH" ? "Výzkumný model · bez autonomních sázek" : "" : card.currentCount ? `Aktuálně vybráno: ${card.currentCount}` : "Momentálně bez výběru"}{card.currentCount != null ? " · " : ""}Další milník: {sample < 50 ? 50 : sample < 100 ? 100 : 200} · doporučení: {STATUS[card.summary.recommendedStatus]}</p></button>{expanded && <Detail card={card} isPro={isPro} isAdmin={isAdmin} context={context} detail={detail} activity={activity} activityError={activityError} onStatus={(status) => setData((current) => current ? { ...current, cards: current.cards.map((item) => item.strategy === card.strategy && item.policyVersion === card.policyVersion ? { ...item, status } : item) } : current)} />}</article>; })}</div>}
    <QuickOverviewPerformance context={context} isPro={isPro} />
    <p className="mt-3 text-[11px] leading-5 text-muted">Nejlepší podskupina nalezená zpětně není nový důkaz. Změna pravidla musí dostat novou verzi a budoucí holdout.</p>
  </section>;
}

function Detail({ card, isPro, isAdmin, context, detail, activity, activityError, onStatus }: { card: Card; isPro: boolean; isAdmin: boolean; context: string; detail: Payload | null; activity: Activity | null; activityError: boolean; onStatus: (status: string) => void }) {
  const s = card.summary;
  return <div className="mt-3 space-y-3 border-t border-border pt-3"><ActivityPanel card={card} isPro={isPro} activity={activity} error={activityError} context={context} /><section><h4 className="text-xs font-bold">Strategie a portfolio</h4><div className="mt-2 grid grid-cols-3 gap-2"><Mini label="Bilance" value={`${s.portfolio.hits}/${s.portfolio.settled}`} /><Mini label="Holdout ROI" value={pct(s.holdout.roi)} /><Mini label="Max. propad" value={`${s.portfolio.maxDrawdown.toFixed(1)} u`} /></div>{s.portfolio.roiConfidence95 && <p className="mt-2 text-[10px] text-muted">95% interval ROI {pct(s.portfolio.roiConfidence95.low)} až {pct(s.portfolio.roiConfidence95.high)}. Kladné krátkodobé ROI samo nepotvrzuje sázkovou výhodu.</p>}</section><section><h4 className="text-xs font-bold">Kvalita pravděpodobností</h4><table className="mt-2 w-full text-left text-[11px]"><thead className="text-muted"><tr><th>Zdroj</th><th>Brier</th><th>Log-loss</th><th>ECE</th><th>n</th></tr></thead><tbody>{[["Model", s.probability.model], ["Opening", s.probability.opening], ["Closing", s.probability.closing]].map(([label, value]) => { const m = value as Metric; return <tr className="border-t border-border" key={label as string}><td className="py-1">{label as string}</td><td>{metric(m.brier)}</td><td>{metric(m.logLoss)}</td><td>{metric(m.ece)}</td><td>{m.n}</td></tr>; })}</tbody></table></section><section><h4 className="text-xs font-bold">Trh a CLV</h4><p className="mt-1 text-[11px] text-muted">Kladné CLV {pct(s.positiveClvRate)} · čerstvý closing {s.portfolio.clvComplete}/{s.portfolio.total}.</p></section><section><h4 className="text-xs font-bold">Bankroll · start 100 u</h4><div className="mt-2 grid grid-cols-3 gap-2">{s.bankroll.map((row) => <Mini key={row.mode} label={row.mode === "FLAT" ? "1 u" : row.mode === "PERCENT" ? "1 %" : "¼ Kelly"} value={`${row.final.toFixed(1)} u`} />)}</div></section>{!isPro ? <p className="rounded-lg bg-background p-2 text-xs text-muted">Segmenty jsou součástí PRO.</p> : detail == null ? <div className="h-16 animate-pulse rounded-lg bg-border/60" /> : <Segments payload={detail} />}{isAdmin && <AdminStatus card={card} context={context} onSaved={onStatus} />}</div>;
}

function ActivityPanel({ card, isPro, activity, error, context }: { card: Card; isPro: boolean; activity: Activity | null; error: boolean; context: string }) {
  if (!isPro) return <p className="rounded-lg bg-background p-2 text-xs text-muted">Aktuální konkrétní výběry jsou součástí PRO.</p>;
  if (card.status === "RETIRED" || card.status === "REJECTED") return null;
  if (error) return <p className="rounded-lg border border-negative/30 bg-negative/5 p-3 text-xs text-negative">Aktuální výběry se nepodařilo načíst.</p>;
  if (!activity) return <div className="h-20 animate-pulse rounded-lg bg-border/60" />;
  if (activity.kind === "unavailable") return <section className="rounded-lg bg-background p-3"><h4 className="text-xs font-bold">Aktuální výběry</h4><p className="mt-1 text-[11px] text-muted">Fauly zatím nemají konzistentní sázkový trh, proto model nevytváří výběry ke vsazení.</p></section>;
  if (activity.kind === "research") return <section className="rounded-lg bg-background p-3"><h4 className="text-xs font-bold">Aktuální výzkumné signály</h4><p className="mt-1 text-[11px] text-muted">Tento model je ve výzkumu a nevytváří autonomní simulované sázky. Výsledky slouží ke kalibraci, nikoliv jako tipy ke vsazení.</p></section>;
  return <div className="space-y-3">
    <ActivityGroup title="Aktuální výběry" empty="Model nyní nemá žádný výběr splňující všechny podmínky." rows={activity.current} context={context} current />
    <ActivityGroup title="Vyhodnocené za poslední 2 dny" empty="Za dnešek ani předchozí den zatím není vyhodnocený výběr." rows={activity.recent} context={context} />
  </div>;
}

function ActivityGroup({ title, empty, rows, context, current = false }: { title: string; empty: string; rows: ActivityRow[]; context: string; current?: boolean }) {
  return <section><div className="flex items-center justify-between gap-2"><h4 className="text-xs font-bold">{title}</h4><span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold">{rows.length}</span></div>{rows.length ? <div className="mt-2 space-y-2">{rows.map((row) => <ActivityEntry key={row.id} row={row} context={context} current={current} />)}</div> : <p className="mt-2 rounded-lg bg-background p-3 text-[11px] text-muted">{empty}</p>}</section>;
}

function ActivityEntry({ row, context, current }: { row: ActivityRow; context: string; current: boolean }) {
  const kickoff = new Date(row.kickoff);
  const live = current && row.activityState === "live";
  const selection = row.market === "1X2" ? row.side === "HOME" ? row.homeName : row.awayName : row.market === "OVER_25" ? "Over 2,5 gólu" : "Oba týmy skórují · Ano";
  const params = new URLSearchParams({ mode: context === "NATIONAL" ? "NATIONAL" : "CLUB", homeLeague: String(row.leagueId), awayLeague: String(row.leagueId), home: String(row.homeTeamId), away: String(row.awayTeamId), fixture: String(row.fixtureId) });
  if (context === "EURO_CUP") { params.set("context", "EURO_CUP"); params.set("homeName", row.homeName); params.set("awayName", row.awayName); if (row.homeLogo) params.set("homeLogo", row.homeLogo); if (row.awayLogo) params.set("awayLogo", row.awayLogo); }
  const resultClass = row.hit == null ? "text-muted" : row.hit ? "text-positive" : "text-negative";
  return <article className="rounded-lg border border-border bg-background px-3 py-2.5">
    <div className="flex flex-wrap items-center gap-2"><time className="shrink-0 text-[10px] font-semibold text-muted">{kickoff.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span className="text-[10px] text-muted">{row.leagueName}</span><span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${current ? live ? "bg-warning/10 text-warning" : "bg-accent/20 text-foreground" : row.hit ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{current ? live ? "Probíhá" : "Čeká" : row.hit ? "Vyšlo" : "Nevyšlo"}</span></div>
    <div className="mt-2 flex min-w-0 items-center gap-2"><TeamLogo src={row.homeLogo ?? ""} alt={row.homeName} size={20} /><strong className="min-w-0 truncate text-xs text-foreground">{row.homeName} – {row.awayName}</strong><TeamLogo src={row.awayLogo ?? ""} alt={row.awayName} size={20} /></div>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted"><strong className="text-foreground">{selection}</strong><span>model {(row.modelProbability * 100).toFixed(1)} %</span><span>trh {(row.marketProbability * 100).toFixed(1)} %</span><span>rozdíl {row.edge >= 0 ? "+" : ""}{(row.edge * 100).toFixed(1)} p. b.</span><span>{row.decimalOdds == null ? "bez kurzu" : `kurz ${row.decimalOdds.toFixed(2)}${row.bookmaker ? ` · ${row.bookmaker}` : ""}`}</span><span>EV {pct(row.expectedValue)}</span></div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[10px]"><span className={resultClass}>{current ? `Zmrazeno ${row.qualifiedAt ? new Date(row.qualifiedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}` : `${row.homeGoals}:${row.awayGoals} · ${row.profit == null ? "zisk —" : `${row.profit >= 0 ? "+" : ""}${row.profit.toFixed(2)} u`}${row.clv == null ? " · CLV —" : ` · CLV ${pct(row.clv)}`}`}</span><Link href={`/porovnani?${params.toString()}`} className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">Otevřít Porovnání</Link></div>
  </article>;
}

function AdminStatus({ card, context, onSaved }: { card: Card; context: string; onSaved: (status: string) => void }) { const [status, setStatus] = useState(card.status); const [reason, setReason] = useState(""); const [message, setMessage] = useState(""); async function save() { setMessage("Ukládám…"); const response = await fetch("/api/picks/model-lab/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: card.strategy, policyVersion: card.policyVersion, modelContext: context, status, reason }) }); if (response.ok) { onSaved(status); setMessage("Stav uložen a zapsán do auditu."); setReason(""); } else setMessage("Změnu se nepodařilo uložit."); } return <section className="rounded-lg border border-warning/30 bg-warning/5 p-3"><h4 className="text-xs font-bold">Ruční rozhodnutí administrátora</h4><div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr_auto]"><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-xs">{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Důvod změny (min. 10 znaků)" className="min-h-10 rounded-lg border border-border bg-surface px-3 text-xs" /><button type="button" disabled={reason.trim().length < 10} onClick={() => void save()} className="min-h-10 rounded-lg bg-accent px-3 text-xs font-bold disabled:opacity-40">Uložit</button></div>{message && <p className="mt-1 text-[10px] text-muted">{message}</p>}</section>; }

function Segments({ payload }: { payload: Payload }) { return <section><h4 className="text-xs font-bold">Segmenty strategie</h4><div className="mt-2 space-y-2">{payload.segments?.map((segment) => <details key={segment.kind} className="rounded-lg border border-border bg-background"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{segment.kind}</summary><div className="border-t border-border p-2">{segment.groups.map((group) => <p key={group.label} className="flex justify-between gap-3 py-1 text-[11px]"><span>{group.label}{group.descriptiveOnly ? " · popisné" : ""}</span><span>{group.portfolio.settled} · ROI {pct(group.portfolio.roi)} · CLV {pct(group.portfolio.averageClv)}</span></p>)}</div></details>)}</div></section>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background px-2 py-2 text-center"><div className="text-[9px] uppercase tracking-wide text-muted">{label}</div><strong className="mt-1 block text-xs tabular-nums">{value}</strong></div>; }
