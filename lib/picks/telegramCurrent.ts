import type { DailyPublicationCandidate } from '../data/dailySelectionStore';
import { strategyLifecycle } from './strategyLifecycle';
import { STRATEGY_HUB_CATALOG } from './strategyHub';

export const TELEGRAM_CURRENT_KEY = 'telegram-current:v1:';
export interface CurrentTips {
  version: 1; date: string; asOf: string;
  items: Array<Pick<DailyPublicationCandidate, 'id' | 'fixtureId' | 'strategy' | 'marketKey' | 'kickoff' | 'homeName' | 'awayName' | 'selection' | 'odds' | 'oddsAt' | 'bookmaker'>>;
}
/** Cron-only projection. Source adapters have already rechecked source qualification. */
export function currentTipsProjection(date: string, candidates: DailyPublicationCandidate[], now: Date): CurrentTips {
  return { version: 1, date, asOf: now.toISOString(), items: candidates
    .filter(c => c.qualified && c.currentPriceQualified && c.identityValid && !c.blocked && c.priceKind === 'DIRECT'
      && strategyLifecycle(c.strategy).publish && c.bookmaker && Number.isFinite(c.odds) && c.odds > 1)
    .map(({ id, fixtureId, strategy, marketKey, kickoff, homeName, awayName, selection, odds, oddsAt, bookmaker }) =>
      ({ id, fixtureId, strategy, marketKey, kickoff, homeName, awayName, selection, odds, oddsAt, bookmaker })) };
}
export const currentStrategy = (s: string) => s === 'OVER_25_LEGACY_SHADOW' ? 'OVER_25' : s;
const title = (s: string) => s === 'OVER_25_LEGACY_SHADOW' ? 'Původní Over 2,5' : STRATEGY_HUB_CATALOG.find(c => c.id === s)?.title ?? s;
const esc = (s: string) => s.slice(0, 180).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const clock = (s: string) => new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' }).format(new Date(s));

/** No new selection, fitting or provider fetch. Missing/stale data fail closed. */
export function formatCurrentTips(payload: CurrentTips | null, now: Date, requested?: string, offset = 0, limit = 3, marketFilter?: 'OVER_25' | 'BTTS' | 'TEAM_GOALS'): string[] {
  const age = +now - Date.parse(payload?.asOf ?? '');
  if (!payload || payload.version !== 1 || !Number.isFinite(age) || age < 0 || age > 90 * 60_000)
    return ['Aktuální přehled tipů není dostupný nebo je starší než 90 minut. Počkej na další běh sběru. Starší publikované tipy zůstávají v historii.'];
  const groups = new Map<string, { item: CurrentTips['items'][number]; sources: string[] }>();
  for (const c of payload.items) {
    if (marketFilter) {
      let market: string;
      try { market = JSON.parse(c.marketKey)[0]; } catch { continue; }
      if (typeof market !== 'string' || (marketFilter === 'TEAM_GOALS' ? !market.startsWith('TEAM_') : market !== marketFilter)) continue;
    }
    const quoteAge = +now - Date.parse(c.oddsAt), lead = Date.parse(c.kickoff) - +now;
    if (!strategyLifecycle(c.strategy).publish || requested && currentStrategy(c.strategy) !== requested
      || !Number.isFinite(quoteAge) || quoteAge < 0 || quoteAge > 90 * 60_000 || !Number.isFinite(lead) || lead < 30 * 60_000) continue;
    const key = JSON.stringify([c.fixtureId, c.marketKey]);
    const existing = groups.get(key);
    if (existing) { if (!existing.sources.includes(title(c.strategy))) existing.sources.push(title(c.strategy)); }
    else groups.set(key, { item: c, sources: [title(c.strategy)] });
  }
  const rows = [...groups.values()].sort((a, b) => a.item.kickoff.localeCompare(b.item.kickoff) || a.item.id.localeCompare(b.item.id));
  const counts = new Map<string, number>();
  const picked = rows.filter(({ item }) => { const group = currentStrategy(item.strategy), n = counts.get(group) ?? 0; counts.set(group, n + 1); return n >= offset && n < offset + limit; });
  const heading = `📋 <b>Aktuální tipy · ${payload.date}</b>\nPodklady z ${clock(payload.asOf)} · řazeno podle výkopu.\nJde o testované strategie, nikoli jisté výhry.`;
  if (!picked.length) return [heading + '\n\nŽádné další aktuální kvalifikované tipy. Nejde o výpadek ani doporučení sázet starší výběry.'];
  // One bounded block per match; the sender persists the exact response before delivery.
  return [heading, ...picked.map(({ item: c, sources }) =>
    `⏳ <b>${esc(c.homeName)} – ${esc(c.awayName)}</b> · ${clock(c.kickoff)}\n🎯 ${esc(c.selection)}\n💰 ${c.odds.toFixed(2)} · ${esc(c.bookmaker)} · cena ${clock(c.oddsAt)}\nZdroj: ${sources.map(esc).join(', ')}`)];
}
