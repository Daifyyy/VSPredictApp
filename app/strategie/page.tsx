import { redirect } from 'next/navigation';
export default async function LegacyStrategies({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const query = new URLSearchParams();
 for (const [key, value] of Object.entries(await searchParams)) {
   if (typeof value === 'string') query.set(key, value);
   else if (Array.isArray(value)) for (const item of value) query.append(key, item);
 }
 redirect('/vykonnost' + (query.size ? '?' + query : ''));
}
