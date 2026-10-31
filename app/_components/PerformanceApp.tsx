"use client";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppHeader } from './AppHeader';
import { useCurrentUser } from './useCurrentUser';
import { StrategyHub } from './StrategyHub';
import { ModelLab } from './ModelLab';

export function PerformanceApp() {
  const user = useCurrentUser();
  const params = useSearchParams();
  const models = params.get('section') === 'models';
  const query = new URLSearchParams(params.toString()); query.delete('section');
  return <><AppHeader user={user}/><header className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-6">
    <h1 className="page-title">Výkonnost</h1>
    <p className="text-sm text-muted">Strategie a modely mají oddělené bilance. Historický zisk ani výzkumná predikce nejsou doloženou budoucí výhodou.</p>
    <nav aria-label="Pohled výkonnosti" className="flex gap-4">
      <Link prefetch={false} aria-current={!models ? 'page' : undefined} className={!models ? 'font-bold underline' : ''} href={`/vykonnost?${query}`}>Strategie a tikety</Link>
      <Link prefetch={false} aria-current={models ? 'page' : undefined} className={models ? 'font-bold underline' : ''} href={`/vykonnost?${query}&section=models`}>Modely</Link>
    </nav>
  </header>{models ? <main className="mx-auto w-full max-w-6xl p-4 pb-24"><ModelLab isPro={user?.tier === 'PRO' || Boolean(user?.isAdmin)} isAdmin={Boolean(user?.isAdmin)}/></main> : <StrategyHub embedded/>}</>;
}
