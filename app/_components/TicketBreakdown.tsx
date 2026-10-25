import type { StrategyHubOpportunity, StrategyHubTicket } from '@/lib/data/strategyHubStore';
import { combinationConditions, outcomeLabel, ticketBreakdown } from '@/lib/picks/ticketPresentation';

export function TicketBreakdown({ tickets, opportunities }: { tickets: StrategyHubTicket[]; opportunities: StrategyHubOpportunity[] }) {
  if (!tickets.length) return null;
  return <section className="mt-6"><h2 className="text-lg font-bold">Akumulační tikety · samostatná historie</h2>
    <p className="mt-1 text-xs text-muted">Bilance těchto tiketů není bilancí samostatných kombinací. Není nutné sázet celý akumulátor.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{tickets.map(ticket => <article key={ticket.slot} className="rounded-xl border border-border bg-surface p-4">
      <div className="flex justify-between gap-2"><strong>Tiket {ticket.slot === 1 ? 'A' : 'B'}</strong><span>{outcomeLabel(ticket.outcome)}</span></div>
      <p className="mt-2">Kurz {ticket.odds?.toFixed(2) ?? '—'}{ticket.estimatedPriceCount > 0 ? ' · obsahuje odhad ceny' : ''}</p>
      {ticket.profit != null && <p>Profit {ticket.profit >= 0 ? '+' : ''}{ticket.profit.toFixed(2)} j</p>}
      <ol className="mt-3 space-y-3">{ticketBreakdown(ticket, opportunities).map(({ fixtureId, leg }, i) => <li key={`${fixtureId}:${i}`} className="rounded-lg border border-border p-3 text-sm">
        {leg ? <><strong>{i + 1}. {leg.homeName} – {leg.awayName}</strong><p>{leg.selection}</p>
          <p>{outcomeLabel(leg.outcome)} · skóre {leg.score ?? 'nezachyceno'} · kurz {leg.odds?.toFixed(2) ?? '—'}{leg.priceKind === 'SYNTHETIC' ? ' (odhad)' : ''}</p>
          <p className="text-xs text-muted">{leg.bookmaker ?? 'Kancelář nezachycena'}</p>
          {combinationConditions(leg).map(c => <p key={c.label} className="mt-1 text-xs">{outcomeLabel(c.outcome)} · {c.label}</p>)}
          {leg.conditionRetention != null && leg.conditionOddsUplift != null && <details className="mt-2 text-xs text-muted"><summary>Co přidala gólová podmínka</summary><p>Při zachycení zachovala {(leg.conditionRetention * 100).toFixed(0)} % modelových scénářů výhry a zvýšila kurz o {((leg.conditionOddsUplift - 1) * 100).toFixed(0)} %. Jde o modelové srovnání, nikoli záruku.</p></details>}
        </> : <p>Detail nohy #{fixtureId} není zachycen. Výsledek nedoplňujeme odhadem.</p>}
      </li>)}</ol>
    </article>)}</div>
  </section>;
}
