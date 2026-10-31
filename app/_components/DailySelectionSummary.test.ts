import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DailySelectionSummary } from './DailySelectionSummary';
it('does not present a future program date as a completed selection', () => {
  const html = renderToStaticMarkup(createElement(DailySelectionSummary, { date: '2026-11-01', today: '2026-10-31', identity: 'public' }));
  expect(html).toContain('Pro budoucí den');
  expect(html).not.toContain('Žádný publikovaný výběr');
});
it('does not turn initial loading into zero selections', () => {
  const html = renderToStaticMarkup(createElement(DailySelectionSummary, { date: '2026-10-31', today: '2026-10-31', identity: 'public' }));
  expect(html).toContain('Načítání uloženého výběru');
  expect(html).not.toContain('Žádný publikovaný výběr');
});
