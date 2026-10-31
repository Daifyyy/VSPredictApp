import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw Error(url); } }));
vi.mock('@/lib/data/repository', () => { throw Error('Legacy redirect must not fetch club profiles'); });
import Page from './page';
import StrategyPage from '../strategie/page';
it('redirects an old fixture URL without fetching data', async () => {
  await expect(Page({ searchParams: Promise.resolve({ fixture: '42', home: '10', away: '20' }) })).rejects.toThrow('/zapas/42');
});
it('does not infer a fixture from clubs or invalid identity', async () => {
  for (const fixture of [undefined, '-1', '1.5', '1e2']) await expect(Page({ searchParams: Promise.resolve({ fixture, home: '10', away: '20' }) })).resolves.toBeTruthy();
});
it('preserves strategy, date and historical cohort on relocation', async () => {
  await expect(StrategyPage({ searchParams: Promise.resolve({ strategy: 'OVER_25', cohort: 'original', date: '2026-10-31' }) })).rejects.toThrow('/vykonnost?strategy=OVER_25&cohort=original&date=2026-10-31');
});
