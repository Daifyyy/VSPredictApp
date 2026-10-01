import { expect, it } from 'vitest';
import { buildLiveSchedule } from './liveSchedule';
import { liveScheduleDecision, readScheduleResponse } from '../scripts/liveScheduleGate.mjs';
const now = new Date('2026-10-25T00:30:00Z');
it('enforces the schedule size limit while streaming, not after downloading an unbounded body', async () => {
  await expect(readScheduleResponse(new Response('x'.repeat(32769)))).rejects.toThrow('SCHEDULE_TOO_LARGE');
  expect(await readScheduleResponse(new Response('{}'))).toBe('{}');
});
it('merges overlaps and uses absolute UTC windows across the Prague DST change', () => {
  const schedule = buildLiveSchedule([{ kickoff: new Date('2026-10-25T01:00:00Z'), status: 'NS' }, { kickoff: new Date('2026-10-25T02:00:00Z'), status: 'NS' }], now);
  expect(schedule.windows).toEqual([['2026-10-25T00:45:00.000Z', '2026-10-25T06:00:00.000Z']]);
  expect(liveScheduleDecision(schedule, +now, false).run).toBe(false);
  expect(liveScheduleDecision(schedule, +now + 20 * 60_000, false).run).toBe(true);
});
it('falls back hourly for missing, expired, corrupt or future schedules', () => {
  const schedule = buildLiveSchedule([], now);
  for (const value of [null, {}, { ...schedule, generatedAt: '2027-01-01' }, { ...schedule, windows: [['bad', 'bad']] }]) {
    expect(liveScheduleDecision(value, +now, false).run).toBe(false);
    expect(liveScheduleDecision(value, +now, true).run).toBe(true);
  }
  expect(liveScheduleDecision(schedule, +now + 71 * 60_000, true).run).toBe(true);
});
it('uses changed kickoff times on renewal and excludes postponed/finished fixtures', () => {
  const schedule = buildLiveSchedule([{ kickoff: now, status: 'PST' }, { kickoff: now, status: 'FT' }, { kickoff: new Date(+now + 8 * 3600_000), status: 'NS' }], now);
  expect(schedule.windows).toHaveLength(1);
  expect(liveScheduleDecision(schedule, +now, true).run).toBe(false);
});
