'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RESOURCE_METRICS, type ResourceMetric } from '@/lib/resourceBudget';

export function ResourceReadingForm() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <form className="ui-panel p-4 space-y-3" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage('');
    const data = new FormData(event.currentTarget);
    const metric = String(data.get('metric')) as ResourceMetric;
    try {
      const response = await fetch('/api/operations/resources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        metric, unit: RESOURCE_METRICS[metric], source: 'MANUAL', used: Number(data.get('used')), limit: Number(data.get('limit')),
        projected: data.get('projected') ? Number(data.get('projected')) : null,
        periodStart: new Date(String(data.get('start'))).toISOString(), periodEnd: new Date(String(data.get('end'))).toISOString(),
        measuredAt: new Date(String(data.get('measured'))).toISOString(),
      }) });
      if (!response.ok) throw new Error('Odečet nebyl uložen. Zkontrolujte období, čas, jednotky a hodnoty.');
      setMessage('Uloženo.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Uložení selhalo.'); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-bold">Ruční odečet z konzole</h2>
    <label className="block">Parametr <select name="metric">{Object.entries(RESOURCE_METRICS).map(([key, unit]) => <option key={key} value={key}>{key} ({unit})</option>)}</select></label>
    <label className="block">Spotřeba <input required name="used" type="number" min="0" step="any" /></label>
    <label className="block">Skutečný bezplatný limit <input required name="limit" type="number" min="0.000001" step="any" /></label>
    <label className="block">Projekce na konec období (volitelná) <input name="projected" type="number" min="0" step="any" /></label>
    <label className="block">Začátek období <input required name="start" type="datetime-local" /></label>
    <label className="block">Konec období (nezahrnutý) <input required name="end" type="datetime-local" /></label>
    <label className="block">Čas skutečného odečtu <input required name="measured" type="datetime-local" /></label>
    <button className="ui-button ui-button-primary" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit odečet'}</button>
    <p role="status">{message}</p>
  </form>;
}
