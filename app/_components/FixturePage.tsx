import { ZapasyApp } from './ZapasyApp';
import { getCachedFixturesByDates, getRecentResults } from '@/lib/data/repository';
import { pragueDay } from '@/lib/data/fixtures';
import { mergeTips } from '@/lib/picks/results';
import { getResultModelReviews, mergeResultModelReviews } from '@/lib/data/resultModelReviews';
import { logError } from '@/lib/logError';
import type { FixtureDay } from '@/lib/types';

/** Program never requests historical results or model audits. */
export async function FixturePage({ mode }: { mode: 'program' | 'results' }) {
  const history = mode === 'results' ? 7 : 0;
  const count = mode === 'results' ? history + 1 : 6;
  const now = new Date().getTime();
  const dates = Array.from({ length: count }, (_, i) => pragueDay(new Date(now + (i - history) * 86400_000)));
  let days: FixtureDay[] = dates.map(date => ({ date, fixtures: [], played: [] }));
  let unavailable = false;
  try {
    days = await getCachedFixturesByDates(dates);
    if (mode === 'results') {
      days = mergeTips(days, await getRecentResults(history + 1));
      days = mergeResultModelReviews(days, await getResultModelReviews(days.flatMap(day => day.played.map(f => f.fixtureId))));
    } else days = days.map(day => ({ ...day, played: [] }));
  } catch (error) { unavailable = true; logError(`page.${mode}.data`, error); }
  return <div className="flex-1">
    {unavailable && <p role="status" className="m-4 rounded border p-3">Část dat se nepodařilo načíst. Prázdný seznam není potvrzením, že nejsou zápasy nebo výsledky.</p>}
    <ZapasyApp days={days} resultDays={history} initialView={mode}/>
    <footer className="mx-auto max-w-4xl px-4 py-6 text-center text-xs text-muted">Data: API-Football. Bez živého přenosu.</footer>
  </div>;
}
