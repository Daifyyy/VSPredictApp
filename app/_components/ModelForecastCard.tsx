import Link from 'next/link';
import { MODEL_SOURCE_LABELS, modelSelectionLabel } from '@/lib/picks/modelOnly';

export type ForecastCardData = {
  id: string; source: string; market: string; side: string; line: number | null;
  probability: number; qualified: boolean; outcome: string; modelVersion: number;
  modelContext: string; capturedAt: string; reason: string; policyVersion?: number;
  fixtureId?: number; homeName?: string; awayName?: string; kickoff?: string;
};
const outcomes: Record<string, { text: string; style: string }> = {
  WON: { text: '✓ Trefeno', style: 'bg-positive/10 text-positive' },
  LOST: { text: '× Netrefeno', style: 'bg-negative/10 text-negative' },
  VOID: { text: '— Nehodnoceno', style: 'bg-surface text-muted' },
  PENDING: { text: '◷ Čeká', style: 'bg-surface text-muted' },
};
export function ModelForecastCard({ row }: { row: ForecastCardData }) {
  const outcome = outcomes[row.outcome] ?? outcomes.PENDING;
  return <article className="forecast-card overflow-hidden rounded-2xl border border-border shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-border bg-background/40 px-4 py-3">
      <span className="text-xs font-semibold text-muted">{MODEL_SOURCE_LABELS[row.source] ?? row.source}</span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${outcome.style}`}>{outcome.text}</span>
    </div>
    <div className="space-y-3 p-4">
      {row.homeName && row.fixtureId && <Link href={`/zapas/${row.fixtureId}`} className="block text-sm font-bold hover:underline">{row.homeName} – {row.awayName} <span aria-hidden>↗</span></Link>}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0"><h3 className="font-bold leading-snug">{modelSelectionLabel(row)}</h3><p className="mt-1 text-xs text-muted">{row.reason==='MODEL_UNDERDOG_GOAL_THRESHOLD_MET'?'Outsider skóruje · podle modelu':row.qualified ? 'Splňuje podmínky výběru' : 'Pouze predikce · mimo výběr'}</p></div>
        <div className="shrink-0 text-right"><strong className="text-3xl font-extrabold tabular-nums tracking-tight">{Math.round(row.probability * 100)}<span className="ml-0.5 text-base font-medium text-muted">%</span></strong><p className="text-[10px] uppercase tracking-wider text-muted">Odhad modelu</p></div>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-home/75" style={{ width: `${Math.max(0, Math.min(100, row.probability * 100))}%` }}/></div>
      <details className="border-t border-border pt-3 text-xs text-muted"><summary className="cursor-pointer select-none">{row.kickoff ? new Date(row.kickoff).toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' }) + ' · ' : ''}Podklady a verze</summary>
        <dl className="mt-3 grid grid-cols-2 gap-2"><dt>Model / pravidla</dt><dd>v{row.modelVersion} / {row.policyVersion ?? '—'}</dd><dt>Kontext</dt><dd>{row.modelContext}</dd><dt>Zachyceno</dt><dd>{new Date(row.capturedAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}</dd><dt>Podklady</dt><dd>{row.reason === 'NOT_MODEL_UNDERDOG' ? 'Favorit, vyrovnaný zápas nebo nedoložená role' : row.reason === 'INSUFFICIENT_INPUTS' ? 'Nedostatečná důvěra nebo vzorek' : row.qualified ? 'Kvalifikační práh splněn' : 'Pod kvalifikačním prahem'}</dd></dl>
      </details>
    </div>
  </article>;
}
