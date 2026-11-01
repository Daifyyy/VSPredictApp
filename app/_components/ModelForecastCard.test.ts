import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ModelForecastCard } from './ModelForecastCard';
import { ModelOnlyPanel } from './ModelOnlyPanel';

it('shows team event, probability and result while collapsing technical detail', () => {
  const html=renderToStaticMarkup(createElement(ModelForecastCard,{row:{id:'test',source:'TEAM_AWAY_15',market:'TEAM_AWAY_15',side:'OVER',line:1.5,probability:.65,qualified:true,outcome:'WON',modelVersion:8,modelContext:'LEAGUE',policyVersion:2002,capturedAt:'2026-11-01T08:00:00Z',reason:'MODEL_THRESHOLD_MET'}}));
  expect(html).toContain('Hosté dají alespoň 2 góly');
  expect(html).toContain('Trefeno');expect(html).toContain('65');
  expect(html).toContain('<details');expect(html).not.toContain('<details open');
  expect(html).not.toContain('EV');
});
it('exposes all qualified predictions, team filter and separate historical policy',()=>{
  const html=renderToStaticMarkup(createElement(ModelOnlyPanel,{initialDate:'2026-11-01'}));
  expect(html).toContain('Všechny kvalifikované');expect(html).toContain('Všechny predikce');
  expect(html).toContain('Týmové góly');expect(html).toContain('Archiv · 2001');
  expect(html).toContain('Načítání');expect(html).not.toContain('Žádné položky');
});
