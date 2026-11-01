import { describe,expect,it } from 'vitest';
import { mainModelCandidates,modelCandidate,settleModelForecast,appendModelDaily,accuracyInterval,type ModelForecastInput } from './modelOnly';
const now=new Date('2026-10-31T09:00:00Z');
const fixture:ModelForecastInput={fixtureId:1,leagueId:39,homeTeamId:1,awayTeamId:2,homeName:'A',awayName:'B',kickoff:new Date('2026-10-31T18:00:00Z'),predictedAt:new Date('2026-10-31T08:00:00Z'),status:'NS',available:true,lowConfidence:false,readinessSample:8,modelVersion:8,contextVersion:1,modelContext:'LEAGUE',homeWin:.6,draw:.2,awayWin:.2,over25:.65,lambdaHome:2,lambdaAway:1};
describe('price-free prospective policy',()=>{
 it('requires at least 60 percent for recommendations, including ELO and combinations',()=>{
  for(const p of [.56,.58,.5999,.6,.65]){
   for(const source of ['MAIN_1X2','ELO_1X2']){
    expect(modelCandidate(fixture,source,[p,(1-p)/2,(1-p)/2],now)?.qualified).toBe(p>=.6);
   }
   expect(modelCandidate(fixture,'MODEL_COMBINATION',[1-p,p],now,{market:'COMBINATION',side:'HOME',line:4.5})?.qualified).toBe(p>=.6);
  }
 });
 it('qualifies without prices, EV or market benchmark and has a separate identity',()=>{
  const rows=mainModelCandidates(fixture,now);expect(rows).toHaveLength(7);
  expect(rows.find(r=>r.source==='MAIN_1X2')).toMatchObject({qualified:true,side:'HOME',policyVersion:2004});
  expect(rows.find(r=>r.source==='ORIGINAL_OVER')).toMatchObject({qualified:true,side:'OVER',probability:.65});
  expect(JSON.stringify(rows)).not.toMatch(/decimalOdds|bookmaker|priceClv|expectedValue/);
 });
 it('does not use future, stale, started or invalid probability inputs',()=>{
  for(const bad of [{predictedAt:new Date(+now+1)},{predictedAt:new Date(+now-25*3600_000)},{kickoff:new Date(+now+29*60_000)},{status:'FT'},{available:false},{fixtureId:0}])expect(mainModelCandidates({...fixture,...bad},now)).toEqual([]);
  expect(modelCandidate(fixture,'MAIN_1X2',[.8,.8,-.6],now)).toBeNull();
 });
 it('retains valid forecasts below the selection threshold but never promotes missing inputs',()=>{
  expect(modelCandidate({...fixture,readinessSample:0},'ORIGINAL_OVER',[.2,.8],now)).toMatchObject({qualified:false,reason:'INSUFFICIENT_INPUTS'});
  expect(modelCandidate(fixture,'ORIGINAL_OVER',[.41,.59],now)).toMatchObject({qualified:false});
  expect(modelCandidate(fixture,'ORIGINAL_OVER',[.4,.6],now)).toMatchObject({qualified:true});
  expect(modelCandidate(fixture,'ORIGINAL_OVER',[.8,.2],now)).toMatchObject({qualified:false,side:'UNDER',probability:.8});
 });
 it('joint combination is bounded and never manufactured by multiplying prices',()=>{
  const row=mainModelCandidates(fixture,now).find(r=>r.source==='MODEL_COMBINATION')!;
  expect(row.market).toBe('COMBINATION');expect(row.probability).toBeGreaterThan(0);expect(row.probability).toBeLessThan(1);
 });
 it('uses correct multiclass and binary scores on the same outcomes',()=>{
  const row=mainModelCandidates(fixture,now)[0];
  expect(settleModelForecast(row,'FT',1,0)).toMatchObject({hit:true,baselineHit:true,actualClass:0});
  expect(settleModelForecast(row,'FT',1,0)?.brier).toBeCloseTo(.24);
  expect(settleModelForecast(row,'FT',1,1)).toMatchObject({hit:false,actualClass:1});
  const over=mainModelCandidates(fixture,now)[1];expect(settleModelForecast(over,'FT',0,1)).toMatchObject({hit:false,baselineHit:false});
  expect(settleModelForecast(over,'FT',2,1)).toMatchObject({hit:true});
  expect(settleModelForecast(over,'FT',null,null)).toBeNull();expect(settleModelForecast(over,'PST',0,0)).toBeNull();
  expect(settleModelForecast(over,'AET',2,1)).toBeNull();expect(settleModelForecast(over,'CANC',null,null)?.outcome).toBe('VOID');
 });
 it('preserves previous selections with diversification and no forced filling',()=>{
  const candidates=Array.from({length:20},(_,i)=>({...mainModelCandidates({...fixture,fixtureId:i+1,leagueId:Math.floor(i/4)},now)[0],probability:.9-i*.01}));
  const selected=appendModelDaily([],candidates,now);expect(selected).toHaveLength(5);
  expect(selected.filter(r=>r.leagueId===0)).toHaveLength(2);
  expect(appendModelDaily(selected,[{...candidates[19],probability:.99}],now)).toEqual(selected);
  expect(appendModelDaily([],candidates.map(c=>({...c,qualified:false})),now)).toEqual([]);
 });
 it('keeps four team markets distinct, uses their own score and never total match goals',()=>{
  const rows=mainModelCandidates(fixture,now).filter(r=>r.market.startsWith('TEAM_'));
  expect(rows).toHaveLength(4);expect(new Set(rows.map(r=>r.id)).size).toBe(4);
  for(const row of rows){
   const lambda=row.market.startsWith('TEAM_HOME')?2:1;
   expect(row.probability).toBeCloseTo(1-Math.exp(-lambda)*(row.line===.5?1:1+lambda));
   expect(row.qualified).toBe(row.probability>=.6&&(row.line!==.5||row.market.startsWith('TEAM_AWAY')));
   const hit=(row.market.startsWith('TEAM_HOME')?0:3)>row.line!;
   expect(settleModelForecast(row,'FT',0,3)).toMatchObject({hit,actualClass:Number(hit)});
   expect(settleModelForecast(row,'FT',null,3)).toBeNull();
   expect(settleModelForecast({...row,line:2.5},'FT',3,0)).toBeNull();
  }
  expect(mainModelCandidates({...fixture,lambdaHome:NaN},now).some(r=>r.source.startsWith('TEAM_HOME'))).toBe(false);
  expect(mainModelCandidates({...fixture,readinessSample:0},now).filter(r=>r.source.startsWith('TEAM_')).every(r=>!r.qualified)).toBe(true);
 });
 it('team thresholds are inclusive and remain independent of odds',()=>{
  for(const [market,line,threshold] of [['TEAM_AWAY_05',.5,.6],['TEAM_AWAY_15',1.5,.6]] as const){
   expect(modelCandidate(fixture,market,[1-threshold,threshold],now,{market,line,side:'OVER'})?.qualified).toBe(true);
   expect(modelCandidate(fixture,market,[1-threshold+.001,threshold-.001],now,{market,line,side:'OVER'})?.qualified).toBe(false);
  }
 });
 it('requires a model underdog with a ten-point win gap for one-goal recommendations',()=>{
  const picked=(f:ModelForecastInput,market='TEAM_HOME_05')=>mainModelCandidates(f,now).find(r=>r.market===market)!;
  expect(picked(fixture)).toMatchObject({qualified:false,reason:'NOT_MODEL_UNDERDOG'});
  expect(picked({...fixture,homeWin:.2,awayWin:.6})).toMatchObject({qualified:true,reason:'MODEL_UNDERDOG_GOAL_THRESHOLD_MET'});
  expect(picked({...fixture,homeWin:.35,awayWin:.45})).toMatchObject({qualified:true});
  expect(picked({...fixture,homeWin:.351,awayWin:.449})).toMatchObject({qualified:false});
  expect(picked({...fixture,homeWin:.4,awayWin:.4})).toMatchObject({qualified:false});
  expect(picked({...fixture,homeWin:NaN})).toMatchObject({qualified:false});
  expect(picked({...fixture,homeWin:.2,awayWin:.6,lambdaHome:.8})).toMatchObject({qualified:false,reason:'BELOW_MODEL_THRESHOLD'});
 });
 it('returns uncertainty rather than 60% as proof',()=>{expect(accuracyInterval(0,0)).toBeNull();const ci=accuracyInterval(6,10)!;expect(ci[0]).toBeLessThan(.5);expect(ci[1]).toBeGreaterThan(.8);});
});
