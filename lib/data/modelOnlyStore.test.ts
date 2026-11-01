import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('../picks/aiResearch',()=>({aiFlags:()=>({inference:true})}));
vi.mock('../resourceBudgetGuard',()=>({resourceBudgetGuard:async()=>null}));
const m=vi.hoisted(()=>({fixtures:vi.fn(),elo:vi.fn(),ai:vi.fn(),create:vi.fn(),forecasts:vi.fn(),day:vi.fn(),cache:vi.fn(),query:vi.fn(),execute:vi.fn()}));
vi.mock('../db',()=>({prisma:{fixturePrediction:{findMany:m.fixtures},clubEloFixtureSnapshot:{findMany:m.elo},aIForecastSnapshot:{findMany:m.ai},modelOnlyForecast:{createMany:m.create,findMany:m.forecasts},modelOnlyDay:{findUnique:m.day},apiCache:{findUnique:m.cache},$queryRaw:m.query,$executeRaw:m.execute}}));
import { captureModelOnly,readModelOnly,settleModelOnly,runModelOnly } from './modelOnlyStore';
const now=new Date('2026-10-31T09:00:00Z');
const fixture={fixtureId:1,leagueId:39,homeTeamId:1,awayTeamId:2,homeName:'A',awayName:'B',kickoff:new Date('2026-10-31T18:00:00Z'),predictedAt:new Date('2026-10-31T08:00:00Z'),status:'NS',available:true,lowConfidence:false,readinessSample:8,modelVersion:8,contextVersion:1,modelContext:'LEAGUE',homeWin:.6,draw:.2,awayWin:.2,over25:.65,lambdaHome:2,lambdaAway:1};
beforeEach(()=>{vi.clearAllMocks();m.elo.mockResolvedValue([]);m.ai.mockResolvedValue([]);m.create.mockResolvedValue({count:3});m.day.mockResolvedValue(null);m.cache.mockResolvedValue(null);m.forecasts.mockResolvedValue([]);m.fixtures.mockResolvedValue([fixture]);m.query.mockResolvedValue([]);});
it.each([1,50])('captures %i fixtures with fixed query count and insert-only compact rows',async n=>{
 m.fixtures.mockResolvedValue(Array.from({length:n},(_,i)=>({...fixture,fixtureId:i+1})));await captureModelOnly(now);
 expect(m.fixtures).toHaveBeenCalledTimes(1);expect(m.elo).toHaveBeenCalledTimes(1);expect(m.ai).toHaveBeenCalledTimes(1);expect(m.create).toHaveBeenCalledTimes(1);
 const data=m.create.mock.calls[0][0];expect(data.skipDuplicates).toBe(true);expect(data.data).toHaveLength(n*7);expect(Object.keys(m.fixtures.mock.calls[0][0].select)).not.toContain('inputSnapshot');
 expect(JSON.stringify(data)).not.toMatch(/odds|bookmaker|roi|priceClv/);
});
it('never reads concrete forecasts for public summary',async()=>{const result=await readModelOnly('2026-10-31',false);expect(result.locked).toBe(true);expect(result.daily).toEqual([]);expect(m.forecasts).not.toHaveBeenCalled();});
it('paginates reads and never computes or exports historical inputs on GET',async()=>{await readModelOnly('2026-10-31',true,2);expect(m.forecasts.mock.calls[0][0]).toMatchObject({skip:60,take:31});expect(m.fixtures).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
it('settlement only replaces changed definitive results with one bounded batch',async()=>{
 const row={id:'a',market:'OVER_25',side:'OVER',line:2.5,probabilities:[.35,.65],status:'FT',home:0,away:1};m.query.mockResolvedValue([row]);
 expect((await settleModelOnly(now)).settled).toBe(1);expect(m.execute).toHaveBeenCalledTimes(1);
 const sql=m.query.mock.calls[0][0].join('');expect(sql).toContain('IS DISTINCT FROM');expect(sql).toContain('LIMIT 500');
 m.query.mockResolvedValue([]);m.execute.mockClear();expect((await settleModelOnly(now)).settled).toBe(0);expect(m.execute).not.toHaveBeenCalled();
});
it('dry run has no inference, database reads or writes',async()=>{expect((await runModelOnly(now,{dryRun:true})).status).toBe('DRY_RUN');expect(m.execute).not.toHaveBeenCalled();expect(m.fixtures).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
it('an overlapping job exits before reading data',async()=>{m.execute.mockResolvedValue(0);expect((await runModelOnly(now)).status).toBe('LEASE_HELD');expect(m.fixtures).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();});
it('filters qualified team predictions in SQL before pagination, with explicit historical policy',async()=>{
 await readModelOnly('2026-10-31',true,1,'TEAM_GOALS',true,2001);
 expect(m.forecasts.mock.calls[0][0]).toMatchObject({where:{policyVersion:2001,qualified:true,source:{startsWith:'TEAM_'}},skip:30,take:31});
 expect(m.day.mock.calls[0][0]).toMatchObject({where:{key:'2001:2026-10-31'}});
});
it.each(['probability_desc','probability_asc','kickoff'] as const)('sorts the whole query before pagination: %s',async sort=>{
 await readModelOnly('2026-11-01',true,2,undefined,true,2004,sort);
 const query=m.forecasts.mock.calls[0][0];
 expect(query.skip).toBe(60);expect(query.take).toBe(31);
 expect(query.orderBy).toEqual(sort==='kickoff'?[{kickoff:'asc'},{id:'asc'}]:[{probability:sort==='probability_asc'?'asc':'desc'},{kickoff:'asc'},{id:'asc'}]);
});
