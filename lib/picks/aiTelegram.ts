import type { AIResearchDay } from '../data/aiResearchStore';
const esc = (s: string) => s.slice(0, 150).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function aiTipPicks(data: AIResearchDay | null | undefined, now: Date) {
  const age = +now - Date.parse(data?.asOf ?? '');
  if (!data || data.version !== 1 || !Number.isFinite(age) || age < 0 || age > 90 * 60_000) return [];
  return data.picks.filter(p => {
    // A new verification is allowed only for the identical book and immutable price.
    const age = +now - Date.parse(p.verifiedAt ?? p.quotedAt), lead = Date.parse(p.kickoff) - +now;
    return p.currentEligible && p.outcome === 'PENDING' && Number.isFinite(age) && age >= 0 && age <= 90 * 60_000 && lead >= 30 * 60_000;
  }).slice(0, 3);
}
export function formatAITips(data: AIResearchDay | null | undefined, now: Date): string[] {
  const title = '🧪 <b>AI výzkum · Over 2,5</b>\nExperimentální, neověřená strategie. Oddělená od původního Overu.';
  const age = +now - Date.parse(data?.asOf ?? '');
  if (!data || !Number.isFinite(age) || age < 0 || age > 90 * 60_000) return [title + '\nAktuální AI podklady nejsou dostupné; nejde o nulovou bilanci.'];
  const picks = aiTipPicks(data, now);
  const time = new Date(data.asOf).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
  return [title + `\nPodklady: ${time}`, ...(picks.length ? picks.map(p => `⏳ <b>${esc(p.homeName)} – ${esc(p.awayName)}</b>\n🎯 Více než 2,5 gólu\n💰 ${p.odds.toFixed(2)} · ${esc(p.bookmaker)}`) : ['Žádný aktuální kvalifikovaný AI výběr.'])];
}
export function formatAIResults(data: AIResearchDay | null | undefined): string[] {
  if (!data) return [];
  const settled = data.picks.filter(p => p.outcome !== 'PENDING');
  if (!settled.length) return [];
  return ['🧪 <b>AI výzkum · výsledky publikovaných výběrů</b>', ...settled.map(p => `${p.outcome === 'WON' ? '✅' : p.outcome === 'LOST' ? '❌' : '↩️'} ${esc(p.homeName)} – ${esc(p.awayName)} · Over 2,5 · ${p.odds.toFixed(2)}`)];
}
