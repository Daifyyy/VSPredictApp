// Offline schedule arithmetic, not provider usage or billing telemetry.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
function cardinality(field, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [range, step = '1'] = part.split('/');
    const [lo, hi] = range === '*' ? [0, max] : range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
    for (let n = lo; n <= hi; n += Number(step)) values.add(n);
  }
  return values.size;
}
function summarize(source) {
  const rows = [...source.matchAll(/^\s*- cron: "([^"]+)"/gm)].map(([, cron]) => {
    const [minute, hour, ...days] = cron.split(' ');
    if (days.some(day => day !== '*')) throw Error('Only daily schedules supported');
    return { cron, slotsPerDay: cardinality(minute, 59) * cardinality(hour, 23) };
  });
  return { total: rows.reduce((sum, row) => sum + row.slotsPerDay, 0), rows };
}
const baseline = summarize(execFileSync('git', ['show', 'e732368:.github/workflows/cron.yml'], { encoding: 'utf8' }));
const previous = summarize(execFileSync('git', ['show', 'ad0e1de:.github/workflows/cron.yml'], { encoding: 'utf8' }));
const current = summarize(readFileSync('.github/workflows/cron.yml', 'utf8'));
console.log(JSON.stringify({ metric: 'Scheduled UTC-day trigger slots; excludes manual runs, retries, batched HTTP calls and skipped executions', baseline, previous, current,
  totalReductionPercent: 100 * (baseline.total - current.total) / baseline.total,
  thisChangeReductionPercent: 100 * (previous.total - current.total) / previous.total,
  providerCallsReductionPercent: null, neonTransferReductionPercent: null }, null, 2));
