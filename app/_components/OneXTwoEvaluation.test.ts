import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OneXTwoEvaluation } from './OneXTwoEvaluation';
import { evaluateOneXTwoProspective } from '@/lib/picks/oneXTwoProspective';

describe('full 1X2 evaluation display', () => {
  it('does not turn a missing report into zero accuracy', () => {
    const html = renderToStaticMarkup(createElement(OneXTwoEvaluation, { report: null }));
    expect(html).toContain('Souhrn zmrazených predikcí ještě není připraven');
    expect(html).toContain('Nejde o nulovou úspěšnost');
    expect(html).not.toContain('0 %');
  });
  it('distinguishes future samples and missing historical audits and marks stale reports', () => {
    const report = evaluateOneXTwoProspective([], new Date('2020-01-01'));
    report.coverage.validAudits = 98;
    report.coverage.future = 98;
    report.coverage.completedWithoutAudit = 201;
    const html = renderToStaticMarkup(createElement(OneXTwoEvaluation, { report }));
    expect(html).toContain('201');
    expect(html).toContain('Zatím není žádný dokončený způsobilý zápas');
    expect(html).toContain('starší než 48 hodin');
    expect(html).not.toContain('<table');
  });
});
