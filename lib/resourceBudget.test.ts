import { expect, it } from 'vitest';
import { RESOURCE_METRICS, evaluateResourceBudget, validResourceSnapshot, budgetAllowsJob, type ResourceBudgetSnapshot } from './resourceBudget';
const now=new Date('2026-10-03T12:00:00Z');
const row=(used=10):ResourceBudgetSnapshot=>({metric:'neon.transfer',unit:'GB',used,limit:100,projected:null,source:'MANUAL',periodStart:'2026-10-01T00:00:00Z',periodEnd:'2026-11-01T00:00:00Z',measuredAt:now.toISOString()});
it.each([[69,'UNKNOWN'],[70,'SAVING'],[85,'CRITICAL'],[95,'STOP']])('honours threshold %s', (used,mode)=>expect(evaluateResourceBudget([row(Number(used))],now).mode).toBe(mode));
it('requires all known capacities and fresh actual readings for normal',()=>{
  const rows=Object.entries(RESOURCE_METRICS).map(([metric,unit])=>({...row(),metric,unit}) as ResourceBudgetSnapshot);
  expect(evaluateResourceBudget(rows,now).mode).toBe('NORMAL');
  expect(evaluateResourceBudget(rows.map(r=>({...r,source:'ESTIMATE'})),now).mode).toBe('UNKNOWN');
});
it('keeps dangerous usage protective even when stale, ignores ended periods',()=>{
  expect(evaluateResourceBudget([{...row(96),measuredAt:'2026-10-01T00:00:00Z'}],now).mode).toBe('STOP');
  expect(evaluateResourceBudget([{...row(96),periodEnd:'2026-10-03T11:00:00Z',measuredAt:'2026-10-02T00:00:00Z'}],now).mode).toBe('UNKNOWN');
});
it('rejects invalid units, future measurements and invalid limits',()=>{
  for(const patch of [{unit:'MB'},{limit:0},{used:-1},{measuredAt:'2027-01-01'},{projected:0}]) expect(validResourceSnapshot({...row(),...patch},now)).toBe(false);
});
it('reserves critical capacity for published closing and settlement, never fresh publications',()=>{
  expect(budgetAllowsJob('CRITICAL','daily-selection')).toBe(false);
  expect(budgetAllowsJob('CRITICAL','snapshot-odds')).toBe(false);
  expect(budgetAllowsJob('CRITICAL','settle-results')).toBe(true);
  expect(budgetAllowsJob('UNKNOWN','collect-live')).toBe(false);
  expect(budgetAllowsJob('STOP','settle-results')).toBe(false);
});
