import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('removes live scheduling and browser polling but preserves final settlement and closing jobs', () => {
  const workflow = readFileSync('.github/workflows/cron.yml', 'utf8');
  expect(workflow).not.toContain('collect-live');
  expect(workflow).not.toContain('live-schedule');
  for (const job of ['settle-results', 'settle-tips', 'snapshot-odds-priority', 'telegram-digest']) expect(workflow).toContain(job);
  const page = readFileSync('app/_components/ZapasyApp.tsx', 'utf8');
  expect(page).not.toContain('/api/fixtures/live');
  expect(page).not.toContain('<MatchCenter');
});
