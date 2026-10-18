/** Offline shared-cohort scoring. Never called from production inference. */
export type ForecastVector = { over: number; oneXTwo: [number, number, number] };
export type BenchmarkRow = { fixtureId: number; leagueId: number; date: string; homeGoals: number; awayGoals: number; forecasts: Record<string, ForecastVector> };
/** UTC day origin excludes same-day results and requires a conservative completion margin. */
export function benchmarkTrainingBefore<T extends {date: string}>(rows: T[], origin: number): T[] {
  if (!Number.isFinite(origin)) throw Error("INVALID_ORIGIN");
  return rows.filter(r=>Date.parse(r.date)+10800000<origin);
}
const mean = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const log = (p: number) => -Math.log(Math.max(1e-12,p));
export function validateForecast(p: ForecastVector) {
  return Number.isFinite(p.over) && p.over >= 0 && p.over <= 1 && p.oneXTwo.length === 3 &&
    p.oneXTwo.every(x=>Number.isFinite(x)&&x>=0&&x<=1) && Math.abs(p.oneXTwo.reduce((a,b)=>a+b,0)-1)<1e-6;
}
export function forecastLoss(row: BenchmarkRow, key: string) {
  const p=row.forecasts[key], y=Number(row.homeGoals+row.awayGoals>2), side=row.homeGoals>row.awayGoals?0:row.homeGoals===row.awayGoals?1:2;
  return { over: log(y?p.over:1-p.over), oneXTwo: log(p.oneXTwo[side]),
    overBrier:(p.over-y)**2, oneXTwoBrier:p.oneXTwo.reduce((s,v,i)=>s+(v-Number(i===side))**2,0),
    correct:Number(p.oneXTwo.indexOf(Math.max(...p.oneXTwo))===side) };
}
export function scoreForecasts(rows: BenchmarkRow[], keys: string[]) {
  if (new Set(rows.map(r=>r.fixtureId)).size!==rows.length) throw Error("DUPLICATE_FIXTURE");
  for (const r of rows) {
    if (!Number.isFinite(Date.parse(r.date)) || ![r.homeGoals,r.awayGoals].every(x=>Number.isInteger(x)&&x>=0)) throw Error("INVALID_OUTCOME");
    for(const key of keys) if(!r.forecasts[key] || !validateForecast(r.forecasts[key])) throw Error("INVALID_SHARED_FORECAST");
  }
  return Object.fromEntries(keys.map(key=>{
    const scores=rows.map(r=>forecastLoss(r,key));
    const bins=Array.from({length:10},(_,i)=>{
      const group=rows.filter(r=>Math.min(9,Math.floor(r.forecasts[key].over*10))===i);
      return {lower:i/10,n:group.length,predicted:mean(group.map(r=>r.forecasts[key].over)),actual:mean(group.map(r=>Number(r.homeGoals+r.awayGoals>2)))};
    });
    return [key,{n:rows.length,overLogLoss:mean(scores.map(s=>s.over)),oneXTwoLogLoss:mean(scores.map(s=>s.oneXTwo)),overBrier:mean(scores.map(s=>s.overBrier)),oneXTwoBrier:mean(scores.map(s=>s.oneXTwoBrier)),oneXTwoAccuracy:mean(scores.map(s=>s.correct)),overEce:rows.length?bins.reduce((s,b)=>s+b.n*Math.abs((b.predicted??0)-(b.actual??0)),0)/rows.length:null,bins}];
  }));
}
/** Paired whole-day bootstrap. Negative difference favors candidate; descriptive only. */
export function pairedForecastInterval(rows: BenchmarkRow[], candidate: string, baseline: string, market: "over"|"oneXTwo") {
  const grouped=new Map<string,number[]>();
  for(const r of rows){const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Prague"}).format(new Date(r.date));const group=grouped.get(day)??[];group.push(forecastLoss(r,candidate)[market]-forecastLoss(r,baseline)[market]);grouped.set(day,group);}
  const blocks=[...grouped.values()]; if(blocks.length<5 || rows.length<20)return null;
  let seed=54231;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const samples=Array.from({length:2000},()=>{let sum=0,n=0;for(let i=0;i<blocks.length;i++){const block=blocks[Math.floor(random()*blocks.length)];for(const x of block){sum+=x;n++;}}return sum/n;}).sort((a,b)=>a-b);
  return {days:blocks.length,delta:mean(blocks.flat()),lower95:samples[49],upper95:samples[1949]};
}
