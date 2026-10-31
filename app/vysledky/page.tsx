import { FixturePage } from '../_components/FixturePage';
export const metadata = { title: 'Výsledky a vyhodnocení', description: 'Konečné výsledky zápasů a porovnání s předzápasovým očekáváním.' };
export const dynamic = 'force-static';
export const revalidate = 300;
export default function ResultsPage() { return <FixturePage mode="results"/>; }
