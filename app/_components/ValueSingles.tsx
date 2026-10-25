'use client';
import { useEffect, useState } from 'react';
import type { ValueSinglesView } from '@/lib/picks/valueSingles';

export function ValueSingles({ date }: { date: string }) {
  const [data, setData] = useState<ValueSinglesView | null>(null), [error, setError] = useState(''), [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/picks/strategies?strategy=VALUE&singles=1&date=${encodeURIComponent(date)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw Error(); const body = await r.json(); if (body.locked) { setError('Konkrétní výběry vyžadují PRO.'); return; } if (!body.singles) throw Error(); setData(body.singles); })
      .catch(e => { if (e.name !== 'AbortError') setError('Přehled není dostupný. Nejde o nulovou bilanci.'); });
    return () => controller.abort();
  }, [date]);
  return <section className="ui-panel mt-5 p-4"><h2 className="text-xl font-bold">VALUE · jeden zápas, jedna kombinace</h2>
    <p className="mt-2 text-sm">Výhra + gólová hranice jako samostatná sázka. Nepotřebuje další zápas ani cílový kurz akumulátoru. Jde o stávající kvalifikované výběry, ne nově ověřenou strategii.</p>
    <p className="mt-2 rounded-lg bg-warning/10 p-3 text-sm">Bez preference kanceláře. U české sázkovky ověř stejnou kombinaci a její celkový kurz; jednotlivé kurzy nenásob. Uvedená kancelář je pouze zdroj referenční ceny, nikoli potvrzení české nabídky.</p>
    {error ? <p role="status">{error}</p> : !data ? <p role="status">Načítání…</p> : <>
      <p className="mt-2 text-xs text-muted">Podklady: {data.asOf ? new Date(data.asOf).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }) : 'nezachyceny'}. Historie tiketů níže se do bilance singlů nepřenáší.</p>
      {data.stale ? <p role="status">Aktuální podklady chybějí nebo jsou starší než 90 minut. Staré ceny nenabízíme.</p> : !data.items.length ? <p>Žádná aktuální kvalifikovaná kombinace. Výběr nevynucujeme.</p> : <ol className="mt-3 grid gap-3 sm:grid-cols-2">{data.items.slice(page * 30, (page + 1) * 30).map(item => <li key={item.id} className="rounded-lg border border-border p-3">
        <strong>{item.homeName} – {item.awayName}</strong><p>{item.selection}</p><p>Celá kombinace {item.odds.toFixed(2)} · {item.bookmaker}</p>
        <p className="text-xs text-muted">Cena {new Date(item.oddsAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}</p>
        <p className="text-sm">{item.minimumAcceptableOdds != null ? `Cenové pásmo podle zachycených vstupů: ${item.minimumAcceptableOdds.toFixed(2)}–6,00. Pod minimem cenové podmínky VALUE neplatí.` : 'Minimální kurz nebyl zachycen; jinou cenu nelze automaticky označit za value.'}</p>
        <p className="text-xs text-muted">Minimum předpokládá nezměněný model a referenční kurz samotné výhry. Jiná nabídka vyžaduje nové ověření; nejde o záruku zisku.</p>
        <p className="mt-2 text-xs">Obě podmínky musejí vyjít. Přidání gólové podmínky samo nezvyšuje šanci na výhru.</p>
      </li>)}</ol>}
      {data.items.length > 30 && <div className="mt-3 flex gap-4"><button disabled={!page} onClick={() => setPage(page - 1)}>Předchozí</button><button disabled={(page + 1) * 30 >= data.items.length} onClick={() => setPage(page + 1)}>Další</button></div>}
    </>}
  </section>;
}
