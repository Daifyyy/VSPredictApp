"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fixtureDetailHref } from '@/lib/fixtureDetailHref';

type Payload = { date: string; status: string; locked: boolean; counts: { documented: number; unverified: number }; items: Array<{
  id: string; fixtureId: number; tier: string; rank: number; decimalOdds: number; status: string;
  snapshot: { homeName?: string; awayName?: string; selection?: string };
}> };
export function DailySelectionSummary({ date, today, identity }: { date: string | null; today: string | null; identity: string }) {
  const [loaded, setLoaded] = useState<{ key: string; data?: Payload; error?: string } | null>(null);
  const key = `${date}:${identity}`;
  const future = Boolean(date && today && date > today);
  const state = loaded?.key === key ? loaded : null;
  useEffect(() => {
    if (!date || !today || future) return;
    const controller = new AbortController();
    fetch(`/api/picks/daily-selection?date=${date}`, { signal: controller.signal }).then(async response => {
      if (response.status === 404) throw Error('Denní výběr zatím není zapnutý.');
      if (!response.ok) throw Error('Denní výběr se nepodařilo načíst; nejde o prázdný výběr.');
      return response.json() as Promise<Payload>;
    }).then(data => setLoaded({ key, data })).catch(error => {
      if (!controller.signal.aborted) setLoaded({ key, error: error.message });
    });
    return () => controller.abort();
  }, [date, today, future, key]);
  return <section className="ui-panel space-y-3 p-4">
    <h2 className="text-lg font-bold">Denní výběr · nejvýše 5 singlů</h2>
    <p className="text-sm text-muted">Pouze již publikované výběry. Selektor má vlastní neověřenou bilanci; tip není záruka výhry.</p>
    {future ? <p>Pro budoucí den zatím neuvádíme hotový denní výběr.</p> : state?.error ? <p role="status">{state.error}</p> : !state?.data ? <p>Načítání uloženého výběru…</p> : <>
      {(['DOCUMENTED_SOURCE', 'UNVERIFIED'] as const).map(tier => <div key={tier}>
        <h3 className="font-semibold">{tier === 'DOCUMENTED_SOURCE' ? 'Z doložených strategií' : 'Neověření kandidáti'} · {tier === 'DOCUMENTED_SOURCE' ? state.data!.counts.documented : state.data!.counts.unverified}</h3>
        {state.data!.locked ? <p className="text-sm">Konkrétní tipy a ceny jsou dostupné s PRO.</p> : <>
          {!state.data!.items.some(item => item.tier === tier) && <p className="text-sm text-muted">{state.data!.status === 'NOT_ASSEMBLED' ? 'Výběr ještě nebyl sestaven.' : 'Žádný publikovaný výběr v této úrovni.'}</p>}
          <ul>{state.data!.items.filter(item => item.tier === tier).map(item => <li key={item.id} className="my-2 border-t border-border py-2 text-sm">
            <Link prefetch={false} href={fixtureDetailHref(item.fixtureId) ?? '/'} className="font-semibold underline">{item.snapshot.homeName ?? 'Domácí'} – {item.snapshot.awayName ?? 'Hosté'}</Link>
            <p>{item.rank}. {item.snapshot.selection ?? 'Výběr'} · kurz {item.decimalOdds.toFixed(2)}{item.status === 'WITHDRAWN' ? ' · stažený (zůstává v historii)' : ''}</p>
          </li>)}</ul>
        </>}
      </div>)}
    </>}
    <div className="flex flex-wrap gap-4 text-sm"><Link prefetch={false} href={`/denni-vyber${date && !future ? `?date=${date}` : ''}`} className="underline">Důvody výběru a vlastní bilance</Link><Link prefetch={false} href="/vykonnost" className="underline">Všechny strategie, VALUE/ELO a výzkum</Link></div>
  </section>;
}
