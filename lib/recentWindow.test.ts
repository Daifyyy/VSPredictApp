import { expect, it } from 'vitest';
import { pragueDateBounds, pragueTwoDayStart } from './recentWindow';
it.each([
  ['2026-03-29', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z', 23],
  ['2026-10-25', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z', 25],
  ['2026-10-01', '2026-09-30T22:00:00.000Z', '2026-10-01T22:00:00.000Z', 24],
  ['2027-01-01', '2026-12-31T23:00:00.000Z', '2027-01-01T23:00:00.000Z', 24],
])('keeps the entire Prague day %s, including DST', (day, start, end, hours) => {
  const bounds = pragueDateBounds(day);
  expect(bounds.start.toISOString()).toBe(start);
  expect(bounds.end.toISOString()).toBe(end);
  expect((+bounds.end - +bounds.start) / 3600_000).toBe(hours);
  expect(pragueTwoDayStart(new Date(+bounds.end + 3600_000))).toEqual(bounds.start);
});
