import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fixtureDetailHref } from '@/lib/fixtureDetailHref';
export const metadata = { title: 'Detail zápasu', robots: { index: false } };
export default async function LegacyCompare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const params = await searchParams;
 const raw = params.fixture;
 const href = typeof raw === 'string' && /^\d+$/.test(raw) ? fixtureDetailHref(Number(raw)) : null;
 if (href) redirect(href);
 return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="page-title">Vyber konkrétní zápas</h1><p>Volné porovnávání klubů bylo nahrazeno uloženými predikcemi zápasů. Ze samotné dvojice týmů nelze bezpečně určit původní zápas.</p><Link href="/">Otevřít program</Link></main>;
}
