'use client';
import { useState } from 'react';
import type { AIResearchDay } from '@/lib/data/aiResearchStore';

/** Lazy, read-only view of the same day projection used by Telegram. */
export function AIResearchPanel({ date }: { date: string }) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false);
  const [data, setData] = useState<AIResearchDay | null>(null), [message, setMessage] = useState('');
  const [page, setPage] = useState(0);
  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true); setLoading(true); setMessage('');
    try {
      const response = await fetch(`/api/picks/strategies?strategy=OVER_25&research=ai&date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Error('AI přehled se nepodařilo načíst.');
      setData(body.ai ?? null);
      setMessage(body.locked ? 'Konkrétní AI predikce jsou dostupné s PRO.' : body.limitedReason === 'AI_UI_DISABLED' ? 'AI výzkum zatím není zapnutý pro web.' : body.stale ? 'Podklady chybějí nebo jsou neaktuální; nejde o nulovou bilanci.' : '');
    } catch { setData(null); setMessage('AI přehled není dostupný. Zkus načtení později.'); }
    finally { setLoading(false); }
  }
  return <section className="ui-panel mt-4 p-4">
    <button type="button" onClick={toggle} aria-expanded={open} className="font-bold">🧪 AI výzkum · Over 2,5 {open ? '▴' : '▾'}</button>
    {open && <>
      <p className="mt-2 text-sm text-muted">Samostatný neověřený model BASE. Nemění původní Over, VALUE/ELO ani Denní výběr. Pravděpodobnosti zatím nejsou nezávisle kalibrované.</p>
      {loading && <p role="status">Načítání…</p>}
      {message && <p role="status" className="mt-2 text-warning">{message}</p>}
      {data && <>
        {data.summary ? <p className="mt-3 rounded-lg border border-border p-3 text-sm">Prospektivně: {data.summary.evaluated} vyhodnocených predikcí · {data.summary.settledPicks} uzavřených sázek · profit {data.summary.profit.toFixed(2)} j · ROI {data.summary.roi == null ? '—' : `${(data.summary.roi * 100).toFixed(1)} %`} · log-loss {data.summary.logLoss?.toFixed(3) ?? '—'}. Souhrn z {new Date(data.summary.asOf).toLocaleString('cs-CZ')}; nejde o potvrzenou výhodu.</p> : <p className="mt-2 text-sm">Prospektivní souhrn ještě není zachycen; nejde o nulovou bilanci.</p>}
        <p className="mt-2 text-xs text-muted">Podklady {new Date(data.asOf).toLocaleString('cs-CZ')} · {data.forecasts.length} predikcí · {data.picks.length} oceněných výběrů. Kurz je neměnná cena při kvalifikaci, nikoli záruka současné nabídky.</p>
        {!data.forecasts.length && <p className="mt-2">Zatím žádná zachycená AI predikce. Odloženo kvůli vstupům: {data.rejected.length}.</p>}
        <ul className="mt-3 space-y-2">{data.forecasts.slice(page * 30, (page + 1) * 30).map(f => {
          const pick = data.picks.find(p => p.fixtureId === f.fixtureId);
          return <li key={f.fixtureId} className="rounded-lg border border-border p-3 text-sm">
            <strong>{f.homeName} – {f.awayName}</strong> · {new Date(f.kickoff).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
            <p>Over 2,5: {(f.probability * 100).toFixed(1)} % · {f.outcome === 'PENDING' ? 'Čeká' : f.outcome === 'WON' ? 'Over nastal' : f.outcome === 'LOST' ? 'Over nenastal' : 'Void'}</p>
            {pick ? <p>Kvalifikovaný výběr · {pick.odds.toFixed(2)} · {pick.bookmaker} · {pick.currentEligible ? 'Poslední kontrola ceny prošla' : 'Historický výběr, nyní nedoporučován'}{pick.profit != null ? ` · ${pick.profit.toFixed(2)} j` : ''}{pick.priceClv != null ? ` · CLV ${(pick.priceClv * 100).toFixed(1)} %` : ' · CLV nezachyceno'}</p> : <p className="text-muted">Predikce bez kvalifikované sázky.</p>}
          </li>;
        })}</ul>
        {data.forecasts.length > 30 && <div className="mt-2 flex gap-4"><button disabled={!page} onClick={() => setPage(page - 1)}>Předchozí</button><button disabled={(page + 1) * 30 >= data.forecasts.length} onClick={() => setPage(page + 1)}>Další</button></div>}
      </>}
    </>}
  </section>;
}
