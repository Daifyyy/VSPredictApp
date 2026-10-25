import type { StrategyHubOpportunity, StrategyHubTicket } from '../data/strategyHubStore';

export const outcomeLabel = (value: StrategyHubOpportunity['outcome']) =>
  value === 'WON' ? '✅ Vyhráno' : value === 'LOST' ? '❌ Prohráno' : value === 'VOID' ? '↩ Vráceno' : '⏳ Čeká';

/** Prefer the ticket's own frozen legs; never replace a missing leg with another selection on the fixture. */
export function ticketBreakdown(ticket: StrategyHubTicket, opportunities: StrategyHubOpportunity[]) {
  const pool = ticket.legs ?? opportunities.filter(p => p.ticketSlots.includes(ticket.slot));
  return ticket.fixtureIds.map(fixtureId => {
    const matches = pool.filter(p => p.fixtureId === fixtureId);
    return { fixtureId, leg: matches.length === 1 ? matches[0] : null };
  });
}

/** Diagnostic subconditions only. The stored market settlement remains authoritative. */
export function combinationConditions(item: StrategyHubOpportunity): Array<{ label: string; outcome: StrategyHubOpportunity['outcome'] }> {
  const c = item.combination;
  if (!c || !['HOME', 'AWAY'].includes(c.winner) || !['OVER', 'UNDER'].includes(c.total) || !Number.isFinite(c.line)) return [];
  const valid = c.homeGoals != null && c.awayGoals != null && Number.isInteger(c.homeGoals) && Number.isInteger(c.awayGoals) && c.homeGoals >= 0 && c.awayGoals >= 0;
  const settled = valid && (item.outcome === 'WON' || item.outcome === 'LOST');
  const winnerHit = c.winner === 'HOME' ? c.homeGoals! > c.awayGoals! : c.awayGoals! > c.homeGoals!;
  const total = c.homeGoals! + c.awayGoals!;
  const status = (hit: boolean, push = false): StrategyHubOpportunity['outcome'] => item.outcome === 'VOID' ? 'VOID' : !settled ? 'PENDING' : push ? 'VOID' : hit ? 'WON' : 'LOST';
  return [
    { label: `Výhra ${c.winner === 'HOME' ? item.homeName : item.awayName}`, outcome: status(winnerHit) },
    { label: `${c.total === 'OVER' ? 'Více' : 'Méně'} než ${String(c.line).replace('.', ',')} gólu`, outcome: status(c.total === 'OVER' ? total > c.line : total < c.line, total === c.line) },
  ];
}
