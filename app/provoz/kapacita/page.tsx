import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/authUser';
import { isAdminEmail } from '@/lib/entitlements';
import { readResourceBudget } from '@/lib/data/resourceBudgetStore';
import { ResourceReadingForm } from './ResourceReadingForm';

export default async function ResourcePage() {
  const user = await getCurrentUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();
  const state = await readResourceBudget();
  return <main className="page-shell py-6 space-y-4">
    <h1 className="page-title">Kapacita služeb</h1>
    {process.env.RESOURCE_BUDGET_FORCE_STOP === 'true' && <p role="alert">Nouzové zastavení je zapnuté. Má přednost před níže vypočteným režimem.</p>}
    <p>Režim: {state.mode}. Vynucování: {process.env.RESOURCE_BUDGET_ENFORCEMENT_ENABLED === 'true' ? 'zapnuto' : 'vypnuto'}.</p>
    <p>Neznámá kapacita není volná kapacita. Limity opište ze skutečného tarifu; odhady nejsou účtovaná spotřeba.</p>
    {state.limitedReason && <p role="status">Omezení: {state.limitedReason}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Parametr</th><th>Spotřeba / limit</th><th>Projekce</th><th>Odečet</th><th>Zdroj</th></tr></thead><tbody>
      {state.rows.map(row => <tr key={row.metric}><td>{row.metric}</td><td>{row.used} / {row.limit} {row.unit}</td><td>{row.projected ?? 'Neznámá'}</td><td>{new Date(row.measuredAt).toLocaleString('cs-CZ')}{state.stale.includes(row.metric) ? ' · neaktuální / odhad' : ''}</td><td>{row.source}</td></tr>)}
    </tbody></table></div>
    <p>Chybějící měření: {state.missing.join(', ') || 'žádné'}</p>
    <ResourceReadingForm />
  </main>;
}
