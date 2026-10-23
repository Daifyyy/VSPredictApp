import type { OneXTwoEvaluationReport } from '@/lib/data/oneXTwoEvaluationStore';

const number = (v: number | null) => v == null ? '—' : v.toFixed(3);
export function OneXTwoEvaluation({ report }: { report?: OneXTwoEvaluationReport | null }) {
  if (!report) return <section className="ui-panel mt-4 p-4"><h2 className="text-lg font-bold">Kvalita celého modelu 1X2</h2><p className="mt-2 text-sm text-muted">Souhrn zmrazených predikcí ještě není připraven. Nejde o nulovou úspěšnost. Historická bilance jednotlivých sázek níže měří něco jiného.</p></section>;
  const c = report.coverage, stale = report.stale ?? true;
  return <section className="ui-panel mt-4 p-4">
    <h2 className="text-lg font-bold">Kvalita celého modelu 1X2 · výzkum</h2>
    {report.window && <p className="mt-2 text-xs text-muted">První zachycení od {new Date(report.window.openedFrom).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' })} do {new Date(report.window.openedBefore).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' })} (konec nezahrnutý).</p>}
    <p className="mt-2 text-sm text-muted">Vyhodnocujeme pravděpodobnosti domácích, remízy a hostů, nikoli pouze vybrané favority. Model a trh porovnáváme vždy na totožných zápasech.</p>
    <p className="mt-3 text-sm">Platné předzápasové audity: <strong>{c.validAudits}</strong> · vyhodnocené: <strong>{c.settled}</strong> · budoucí zápasy: <strong>{c.future}</strong></p>
    <p className="mt-2 text-xs text-muted">Dokončené zápasy bez původního úplného auditu: {c.completedWithoutAudit}. Do tohoto srovnání se zpětně nedopočítávají.</p>
    {c.overdue > 0 && <p className="mt-2 text-sm text-warning">U {c.overdue} zápasů chybí konečný stav i více než 6 hodin po výkopu.</p>}
    {!c.settled && <p className="mt-3 rounded-lg bg-warning/10 p-3 text-sm">Zatím není žádný dokončený způsobilý zápas. Kvalitu modelu vůči trhu zatím nelze vyhodnotit.</p>}
    {report.cohorts.slice(0, 16).map((g, i) => <details key={i} className="mt-3 rounded-lg border border-border p-3" open={report.cohorts.length === 1}>
      <summary className="cursor-pointer text-sm font-semibold">Model v{g.modelVersion} · {g.modelContext} v{g.contextVersion} · {g.allModel.n} výsledků</summary>
      <p className="mt-2 text-xs text-muted">Parametry: {Object.entries(g.parameters).map(([k, v]) => `${k}=${v ?? 'nezachyceno'}`).join(', ')}. Různé verze a kalibrace neslučujeme.</p>
      {[['Panel bookmakerů', g.panel], ['Samotný Pinnacle', g.pinnacleSingle]].map(([label, value]) => {
        const p = value as typeof g.panel;
        return <div key={String(label)} className="mt-3 overflow-x-auto"><h3 className="text-sm font-semibold">{String(label)} · společný vzorek {p.n}</h3>
          <table className="mt-2 w-full text-left text-xs"><thead><tr><th>Metrika</th><th>Model</th><th>Trh</th></tr></thead><tbody>
            <tr><td>Log-loss</td><td>{number(p.model.logLoss)}</td><td>{number(p.market.logLoss)}</td></tr>
            <tr><td>Brier (součet pro 1/X/2)</td><td>{number(p.model.brier)}</td><td>{number(p.market.brier)}</td></tr>
            <tr><td>RPS</td><td>{number(p.model.rps)}</td><td>{number(p.market.rps)}</td></tr>
          </tbody></table>
          <p className="mt-2 text-xs text-muted">Nižší je lepší. Bodový rozdíl ani malý vzorek nepotvrzují stabilní výhodu či ziskovost.</p>
          {p.n > 0 && <p className="mt-2 text-xs">Kalibrační odchylka modelu (odhad minus skutečný podíl): {p.model.classCalibration.map((x, k) => `${['1', 'X', '2'][k]} ${x.bias == null ? '—' : (100 * x.bias).toFixed(1)} p. b.`).join(' · ')}</p>}
        </div>;
      })}
    </details>)}
    {report.cohorts.length > 16 && <p className="mt-2 text-xs">Zobrazeno prvních 16 z {report.cohorts.length} oddělených kohort.</p>}
    <p className={`mt-3 text-xs ${stale ? 'text-warning' : 'text-muted'}`}>Souhrn k {new Date(report.asOf).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}{stale ? ' · starší než 48 hodin, nejde o aktuální stav' : ''}. Pouze zápasy se zachycenými tržními signály, nikoli celý program.</p>
  </section>;
}
