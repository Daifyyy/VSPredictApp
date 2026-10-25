import type { CurrentTips } from './telegramCurrent';
import { strategyLifecycle } from './strategyLifecycle';

/** Presentation of existing qualified selections, not a new selection policy or a historical ledger. */
export function valueSinglesView(payload: CurrentTips | null, date: string, now: Date) {
  const age = +now - Date.parse(payload?.asOf ?? '');
  const stale = !payload || payload.version !== 1 || payload.date !== date || !Number.isFinite(age) || age < 0 || age > 90 * 60_000;
  const items = stale || !strategyLifecycle('VALUE').publish ? [] : payload.items.filter(p => {
    const age = +now - Date.parse(p.oddsAt), lead = Date.parse(p.kickoff) - +now;
    return p.strategy === 'VALUE' && Number.isFinite(age) && age >= 0 && age <= 90 * 60_000
      && Number.isFinite(lead) && lead >= 30 * 60_000 && Number.isFinite(p.odds) && p.odds > 1 && !!p.bookmaker;
  }).sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
  return { asOf: payload?.asOf ?? null, stale, items: items.slice(0, 200), truncated: items.length > 200,
    limitedReason: stale ? 'CURRENT_VALUE_NOT_AVAILABLE' : !items.length ? 'NO_QUALIFIED_VALUE_SINGLE' : null };
}
export type ValueSinglesView = ReturnType<typeof valueSinglesView>;
