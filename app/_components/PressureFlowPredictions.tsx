"use client";

import type { StrategyHubPrediction } from "@/lib/data/strategyHubStore";

export type PressureFlowView = "all" | "over25" | "btts" | "team";
type View = PressureFlowView;
const views: Array<{ value: View; label: string }> = [{ value: "all", label: "Přehled" }, { value: "over25", label: "Over 2,5" }, { value: "btts", label: "BTTS" }, { value: "team", label: "Týmové góly" }];
const pct = (value: number) => `${Math.round(value * 100)} %`;

export function PressureFlowPredictions({ rows, view, onViewChange }: { rows: StrategyHubPrediction[]; view: View; onViewChange: (view: View) => void }) {
  return <section className="mt-6">
    <div><p className="page-kicker">Všechny zápasy · bez sázkové kvalifikace</p><h2 className="mt-1 text-xl font-bold">Predikce průběhu</h2><p className="mt-1 text-xs text-muted">Výpočty jsou zmrazené před výkopem. Predikce sama není sázkovou příležitostí.</p></div>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{views.map((item) => <button className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${view === item.value ? "border-accent-strong bg-accent text-accent-ink" : "border-border bg-surface"}`} key={item.value} onClick={() => onViewChange(item.value)}>{item.label}</button>)}</div>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">{rows.map((row) => {
      const headline = view === "btts" ? `BTTS ano ${pct(row.probabilities.btts)}` : view === "team" ? `${row.homeName} O0,5 ${pct(row.probabilities.home05)} · ${row.awayName} O0,5 ${pct(row.probabilities.away05)}` : `Over 2,5 ${pct(row.probabilities.over25)}`;
      const dominance = row.dominance.side === "EVEN" ? "Vyrovnaný obraz" : `${row.dominance.side === "HOME" ? row.homeName : row.awayName} má očekávanou převahu`;
      const totalShots = (row.expectedShots.home ?? 0) + (row.expectedShots.away ?? 0);
      return <article className="rounded-xl border border-border bg-surface p-4" key={row.fixtureId}>
        <div className="flex justify-between gap-3"><div><p className="text-[10px] font-bold uppercase text-muted">{row.leagueName} · {new Date(row.kickoff).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</p><h3 className="mt-1 text-sm font-bold">{row.homeName} – {row.awayName}</h3></div><span className="h-fit rounded-full bg-warning/10 px-2 py-1 text-[10px] font-bold text-warning">Výzkum</span></div>
        <strong className="mt-3 block text-base">{headline}</strong>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-background p-2"><span className="text-muted">Očekávané góly</span><b className="block">{row.expectedGoals.home.toFixed(2)} : {row.expectedGoals.away.toFixed(2)}</b></div><div className="rounded-lg bg-background p-2"><span className="text-muted">Střely celkem</span><b className="block">{Math.round(totalShots)}{row.expectedShots.low != null && row.expectedShots.high != null ? ` · typicky ${Math.round(row.expectedShots.low)}–${Math.round(row.expectedShots.high)}` : ""}</b></div></div>
        <p className="mt-3 text-xs text-muted">Tempo {row.tempo.toLowerCase()} · {dominance} · data {pct(row.confidence)}</p>
        {row.warnings.length ? <details className="mt-2 text-[10px] text-warning"><summary>Omezení dat</summary><p className="mt-1">{row.warnings.join(", ")}</p></details> : null}
      </article>;
    })}</div>
  </section>;
}
