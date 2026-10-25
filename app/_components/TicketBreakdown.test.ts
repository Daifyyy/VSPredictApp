import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { TicketBreakdown } from './TicketBreakdown';
import type { StrategyHubOpportunity } from '@/lib/data/strategyHubStore';
it('renders each leg, score, distinct condition results and ticket profit', () => {
  const leg = { id: 'a', fixtureId: 1, homeName: 'A < B', awayName: 'C', selection: 'Home + over', outcome: 'LOST', score: '1:0', odds: 1.9, bookmaker: 'Book', priceKind: 'DIRECT',
    combination: { winner: 'HOME', total: 'OVER', line: 1.5, homeGoals: 1, awayGoals: 0 } } as StrategyHubOpportunity;
  const html = renderToStaticMarkup(createElement(TicketBreakdown, { opportunities: [], tickets: [{ slot: 1, odds: 3.2, estimatedPriceCount: 0, profit: -1, outcome: 'LOST', fixtureIds: [1, 2], legs: [leg] }] }));
  expect(html).toContain('A &lt; B'); expect(html).toContain('1:0'); expect(html).toContain('-1.00');
  expect(html).toContain('✅ Vyhráno'); expect(html).toContain('❌ Prohráno'); expect(html).toContain('Detail nohy #2');
});
