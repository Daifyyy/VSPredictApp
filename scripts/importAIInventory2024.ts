/** User-authorized one-shot: <= 6 requests, no redirects/retry, no DB imports/writes. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AI_INVENTORY_LEAGUES, inventoryQuota, parseAIInventory } from '../lib/picks/aiInventoryImport';

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
const dir = resolve('.runtime/ai-inventory-2024-v1');
let attempts = 0;
function save(name: string, value: unknown) { writeFileSync(resolve(dir,name), JSON.stringify(value,null,2), { flag:'wx' }); }
const headerNumber = (r: Response, name: string) => {
  const raw = r.headers.get(name);
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
};
async function request(path: string, key: string) {
  if (++attempts > 6) throw Error('REQUEST_BUDGET_EXCEEDED');
  // Persist before network I/O: timeout/failed attempts still consume the authorization budget.
  save(`attempt-${attempts}.json`, { attempt: attempts, path, startedAt: new Date().toISOString() });
  const response = await fetch(`https://v3.football.api-sports.io${path}`, { headers:{ 'x-apisports-key':key },
    redirect:'error', signal:AbortSignal.timeout(20000) });
  const quota = { dayRemaining:headerNumber(response,'x-ratelimit-requests-remaining'), dayLimit:headerNumber(response,'x-ratelimit-requests-limit'),
    minuteRemaining:headerNumber(response,'x-ratelimit-remaining'), minuteLimit:headerNumber(response,'x-ratelimit-limit') };
  save(`response-${attempts}.json`,{ status:response.status, quota, receivedAt:new Date().toISOString() });
  if (!response.ok) throw Error(`PROVIDER_HTTP_${response.status}_NO_RETRY`);
  if (!response.body) throw Error('EMPTY_PROVIDER_BODY');
  const reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
  for (;;) { const part=await reader.read(); if(part.done) break; size+=part.value.byteLength;
    if(size>5*1024**2) { await reader.cancel(); throw Error('RESPONSE_SIZE_LIMIT'); } chunks.push(part.value); }
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || !body.errors || Object.keys(body.errors).length) throw Error('PROVIDER_RESPONSE_ERROR_NO_RETRY');
  return { body, quota };
}
function minuteSafe(q: { minuteRemaining:number|null; minuteLimit:number|null }, needed:number) {
  return q.minuteRemaining !== null && q.minuteLimit !== null && q.minuteLimit>0
    && q.minuteRemaining >= needed + Math.ceil(q.minuteLimit*.2);
}
async function main() {
  if (process.argv.length!==3 || process.argv[2]!=='--approved-six-requests') throw Error('EXPLICIT_APPROVAL_FLAG_REQUIRED');
  const key=process.env.API_FOOTBALL_KEY; if(!key) throw Error('MISSING_PROVIDER_KEY');
  const parent=resolve('.runtime'); if(realpathSync(parent)!==parent) throw Error('UNSAFE_OUTPUT_PARENT');
  if(existsSync(dir)) throw Error('IMPORT_ALREADY_ATTEMPTED_NO_AUTOMATIC_RESUME');
  mkdirSync(dir); // Exclusive directory blocks concurrent or repeated runs.
  save('approval.json',{ season:2024, leagues:AI_INVENTORY_LEAGUES, maxRequests:6, retries:0, databaseWrites:0 });
  const status=await request('/status',key);
  const quota=inventoryQuota(status.body.response?.requests?.current,status.body.response?.requests?.limit_day,5);
  save('quota.json',{...quota,headers:status.quota});
  console.log(JSON.stringify({phase:'QUOTA',...quota,minuteRemaining:status.quota.minuteRemaining}));
  if(!quota.allowed || !minuteSafe(status.quota,5)) throw Error('INSUFFICIENT_OR_UNKNOWN_QUOTA_RESERVE');
  const files=[];
  for(const leagueId of AI_INVENTORY_LEAGUES) {
    const {body,quota:q}=await request(`/fixtures?league=${leagueId}&season=2024`,key);
    const parsed=parseAIInventory(body,leagueId);
    const name=`2024-${leagueId}.json`;
    save(name,{version:1,source:'API_FOOTBALL_LEAGUE_SEASON_FIXTURES',leagueId,season:2024,fetchedAt:new Date().toISOString(),
      apiAttempts:1,pagination:parsed.pagination,count:parsed.fixtures.length,providerRemaining:q.dayRemaining,providerLimit:q.dayLimit,
      sha256:hash(JSON.stringify(parsed.fixtures)),fixtures:parsed.fixtures});
    files.push({file:name,hash:hash(readFileSync(resolve(dir,name),'utf8'))});
    console.log(JSON.stringify({phase:'SAVED',leagueId,fixtures:parsed.fixtures.length,attempts}));
    const remaining=6-attempts;
    if(remaining>0 && (q.dayLimit===null || q.dayRemaining===null || !inventoryQuota(q.dayLimit-q.dayRemaining,q.dayLimit,remaining).allowed
      || !minuteSafe(q,remaining))) throw Error('QUOTA_RESERVE_CHANGED_STOP');
  }
  save('complete.json',{status:'COMPLETE',attempts,files,databaseQueries:0,statisticsRequests:0,trainingAllowed:false});
}
main().catch(error=>{
  const reason=error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)?error.message:'IMPORT_FAILED_NO_RETRY';
  if(existsSync(dir) && attempts>0) save('failure.json',{reason,attempts});
  console.error(JSON.stringify({reason,attempts})); process.exitCode=1;
});
