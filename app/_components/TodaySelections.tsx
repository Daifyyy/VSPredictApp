"use client";

import { useEffect, useMemo, useState } from "react";
import { TeamLogo } from "./TeamLogo";
import { ActionLink, Alert, Badge, Panel, Skeleton, Tabs } from "./ui/primitives";

type SelectionKind = "AUTONOMOUS" | "RESEARCH" | "MANUAL";
type SelectionFilter = "ALL" | SelectionKind;
type TodaySelection = { id: string; fixtureId: number; leagueId: number; leagueName: string | null; homeTeamId: number; awayTeamId: number; homeName: string; awayName: string; homeLogo: string | null; awayLogo: string | null; kickoff: string; kind: SelectionKind; label: string; market: string; side: string; line: number | null; probability: number | null; marketProbability: number | null; edge: number | null; expectedValue: number | null; price: number | null; bookmaker: string | null };
type TodayPayload = { rows: TodaySelection[]; correlatedFixtures: number[] };

const filterItems: Array<{ value: SelectionFilter; label: string }> = [{ value: "ALL", label: "Vše" }, { value: "AUTONOMOUS", label: "Portfolio" }, { value: "RESEARCH", label: "Výzkum" }, { value: "MANUAL", label: "Moje tipy" }];
const kindMeta: Record<SelectionKind, { label: string; tone: "positive" | "warning" | "accent" }> = { AUTONOMOUS: { label: "Simulace 1u", tone: "positive" }, RESEARCH: { label: "Výzkumný signál", tone: "warning" }, MANUAL: { label: "Můj tip", tone: "accent" } };

function percentage(value: number | null, signed = false) { if (value == null) return "—"; const amount = value * 100; return `${signed && amount > 0 ? "+" : ""}${amount.toFixed(1)} %`; }
function comparisonHref(row: TodaySelection) { const params = new URLSearchParams({ mode: "CLUB", homeLeague: String(row.leagueId), awayLeague: String(row.leagueId), home: String(row.homeTeamId), away: String(row.awayTeamId), fixture: String(row.fixtureId) }); return `/porovnani?${params.toString()}`; }

export function TodaySelections({ enabled }: { enabled: boolean }) {
  const [payload, setPayload] = useState<TodayPayload | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<SelectionFilter>("ALL");
  useEffect(() => { if (!enabled) return; const controller = new AbortController(); fetch("/api/picks/today", { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(String(response.status)); setPayload(await response.json() as TodayPayload); }).catch((reason: Error) => { if (reason.name !== "AbortError") setError(true); }); return () => controller.abort(); }, [enabled]);
  const visibleRows = useMemo(() => payload?.rows.filter((row) => filter === "ALL" || row.kind === filter) ?? [], [payload, filter]);
  const groups = useMemo(() => { const map = new Map<number, TodaySelection[]>(); for (const row of visibleRows) map.set(row.fixtureId, [...(map.get(row.fixtureId) ?? []), row]); return [...map.values()]; }, [visibleRows]);
  if (!enabled) return <Alert className="mt-4" title="Dnešní výběry">Konkrétní zápasy, ceny a překryvy jsou součástí PRO.</Alert>;
  if (error) return <Alert className="mt-4" tone="negative" title="Dnešní výběry se nepodařilo načíst">Zkuste načtení stránky zopakovat.</Alert>;
  if (!payload) return <Skeleton className="mt-4 h-36 w-full rounded-2xl" />;
  const counts = { AUTONOMOUS: payload.rows.filter((row) => row.kind === "AUTONOMOUS").length, RESEARCH: payload.rows.filter((row) => row.kind === "RESEARCH").length, MANUAL: payload.rows.filter((row) => row.kind === "MANUAL").length };
  const tabs = filterItems.map((item) => ({ ...item, badge: item.value === "ALL" ? payload.rows.length : counts[item.value] }));
  return <Panel className="mt-4 overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4"><div><p className="page-kicker">Rozhodovací přehled</p><h3 className="mt-1 text-lg font-bold">Dnešní výběry</h3><p className="mt-1 text-xs leading-5 text-muted">Portfolio, výzkumné signály a ruční tipy bez dvojího započítání.</p></div><Tabs items={tabs} value={filter} onChange={setFilter} label="Filtrovat dnešní výběry" /></header>
    {groups.length === 0 ? <div className="p-5 text-sm text-muted">V této skupině dnes zatím není žádný aktuální výběr.</div> : <div className="divide-y divide-border">{groups.map((rows) => <FixtureSelections key={rows[0].fixtureId} rows={rows} correlated={payload.correlatedFixtures.includes(rows[0].fixtureId)} />)}</div>}
    <footer className="border-t border-border bg-background/60 px-4 py-3 text-[11px] leading-5 text-muted">Výzkumný signál není autonomní sázka. ROI portfolia používá pouze neměnně zmrazené výběry se skutečnou cenou.</footer>
  </Panel>;
}

function FixtureSelections({ rows, correlated }: { rows: TodaySelection[]; correlated: boolean }) {
  const fixture = rows[0]; const kickoff = new Date(fixture.kickoff);
  return <article className="p-4 transition hover:bg-background/55"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><time className="min-w-12 text-sm font-black tabular-nums">{kickoff.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" })}</time>{fixture.leagueName ? <span className="text-xs text-muted">{fixture.leagueName}</span> : null}{correlated ? <Badge tone="warning" className="ml-auto">Překryv trhů</Badge> : null}</div>
    <div className="mt-3 flex min-w-0 items-center gap-2"><TeamLogo src={fixture.homeLogo ?? ""} alt={fixture.homeName} size={26} /><strong className="min-w-0 flex-1 truncate text-sm">{fixture.homeName} – {fixture.awayName}</strong><TeamLogo src={fixture.awayLogo ?? ""} alt={fixture.awayName} size={26} /></div>
    <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">{rows.map((row) => { const meta = kindMeta[row.kind]; return <div key={`${row.kind}:${row.id}`} className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(11rem,1.2fr)_repeat(4,minmax(5rem,.55fr))_auto] md:items-center"><div className="min-w-0"><strong className="block truncate text-xs">{row.label}</strong><span className="text-[10px] text-muted">{row.side}{row.line == null ? "" : ` · linie ${row.line.toFixed(1)}`}</span></div><Metric label="Model" value={percentage(row.probability)} /><Metric label="Trh" value={percentage(row.marketProbability)} /><Metric label="Rozdíl" value={row.edge == null ? "—" : `${row.edge > 0 ? "+" : ""}${(row.edge * 100).toFixed(1)} p. b.`} /><Metric label="Kurz / EV" value={row.price == null ? "Bez ceny" : `${row.price.toFixed(2)} / ${percentage(row.expectedValue, true)}`} detail={row.bookmaker} /><Badge tone={meta.tone}>{meta.label}</Badge></div>; })}</div>
    <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[10px] text-muted">{correlated ? "Více souvisejících trhů může znamenat korelovanou expozici." : `${rows.length} ${rows.length === 1 ? "výběr" : "výběry"}`}</p><ActionLink href={comparisonHref(fixture)} size="sm" variant="ghost">Otevřít zápas →</ActionLink></div>
  </article>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail?: string | null }) { return <div className="flex items-baseline justify-between gap-2 md:block"><span className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span><strong className="block text-[11px] tabular-nums">{value}</strong>{detail ? <span className="block truncate text-[9px] text-muted">{detail}</span> : null}</div>; }
