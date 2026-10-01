export interface LiveSchedule { version: 1; generatedAt: string; validUntil: string; windows: Array<[string, string]> }

/** Timing metadata only: no fixture IDs, odds, users or predictions leave the application. */
export function buildLiveSchedule(fixtures: Array<{ kickoff: Date; status: string }>, now = new Date()): LiveSchedule {
  const intervals = fixtures.filter(row => ['NS', 'TBD', '1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'].includes(row.status))
    .map(row => [+row.kickoff - 15 * 60_000, +row.kickoff + 4 * 3600_000] as [number, number])
    .filter(([start, end]) => Number.isFinite(start) && end > +now && start < +now + 26 * 3600_000)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return { version: 1, generatedAt: now.toISOString(), validUntil: new Date(+now + 70 * 60_000).toISOString(), windows: merged.map(([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()]) };
}
