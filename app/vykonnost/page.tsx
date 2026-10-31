import { Suspense } from 'react';
import { PerformanceApp } from '../_components/PerformanceApp';
export const metadata = { title: 'Výkonnost modelů a strategií', description: 'Oddělená historie modelů, strategií, tiketů a výzkumných predikcí.' };
export const dynamic = 'force-static';
export default function PerformancePage() {
  return <Suspense fallback={<p>Načítání přehledu…</p>}><PerformanceApp/></Suspense>;
}
