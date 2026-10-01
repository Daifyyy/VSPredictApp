import { readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Reject stale/invalid schedules. Missing program permits only the hourly recovery slot. */
export function liveScheduleDecision(value, nowMs, hourly) {
  const fallback = { run: hourly, valid: false, reason: 'MISSING_OR_STALE_SCHEDULE' };
  if (!value || value.version !== 1 || !Array.isArray(value.windows) || value.windows.length > 512) return fallback;
  const generated = Date.parse(value.generatedAt), expires = Date.parse(value.validUntil);
  if (!Number.isFinite(generated) || !Number.isFinite(expires) || generated > nowMs || expires <= nowMs || expires - generated > 70 * 60_000 || expires <= generated) return fallback;
  const windows = value.windows.map(w => Array.isArray(w) && w.length === 2 ? w.map(Date.parse) : [NaN, NaN]);
  if (windows.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b) || b < a)) return fallback;
  return { run: windows.some(([a, b]) => nowMs >= a && nowMs <= b), valid: true, reason: 'PROGRAM_WINDOW' };
}

export async function readScheduleResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_SCHEDULE');
  const parts = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new Error('SCHEDULE_TOO_LARGE'); }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}

async function main() {
  const hourly = process.env.SCHEDULE === '2 * * * *';
  const path = '.runtime/live-schedule.json';
  let value = null, saved = false;
  try { if (statSync(path).size <= 32768) value = JSON.parse(readFileSync(path, 'utf8')); } catch { /* hourly recovery */ }
  if (hourly) {
    try {
      const url = new URL('/api/cron/live-schedule', process.env.APP_URL);
      if (url.protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
      const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(20_000), redirect: 'error' });
      if (!response.ok) throw new Error('SCHEDULE_UNAVAILABLE');
      const text = await readScheduleResponse(response);
      const candidate = JSON.parse(text);
      if (!liveScheduleDecision(candidate, Date.now(), hourly).valid) throw new Error('INVALID_SCHEDULE');
      value = { version: 1, generatedAt: candidate.generatedAt, validUntil: candidate.validUntil, windows: candidate.windows };
      mkdirSync('.runtime', { recursive: true }); writeFileSync(path, JSON.stringify(value)); saved = true;
    } catch { console.log('::warning::Program zapasu nelze obnovit; pouziji omezeny hodinovy fallback.'); }
  }
  const decision = liveScheduleDecision(value, Date.now(), hourly);
  if (!decision.valid) console.log('::warning::Chybi aktualni program; mimo hodinovou obnovu se aplikace nevola.');
  appendFileSync(process.env.GITHUB_OUTPUT, `run_live=${decision.run}\nsave_schedule=${saved}\n`);
  console.log(`Live preflight: ${decision.reason}; run=${decision.run}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Live preflight failed'); process.exitCode = 1; });
