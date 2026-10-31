import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('removes live scheduling and browser polling and odds tracking but preserves final settlement', () => {
  const workflow = readFileSync('.github/workflows/cron.yml', 'utf8');
  expect(workflow).not.toContain('collect-live');
  expect(workflow).not.toContain('live-schedule');
  expect(workflow).not.toContain('snapshot-odds-priority');
  for (const job of ['settle-results', 'settle-tips', 'telegram-digest']) expect(workflow).toContain(job);
  const page = readFileSync('app/_components/ZapasyApp.tsx', 'utf8');
  expect(page).not.toContain('/api/fixtures/live');
  expect(page).not.toContain('<MatchCenter');
});
