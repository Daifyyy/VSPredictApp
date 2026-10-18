// Local inventories only: no DB client, provider, env-file or production writes.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PUBLIC_CLUB_LEAGUES } from "../lib/data/catalog";
import { classifyCompetitionRound } from "../lib/stats/seasonPhases";
import type { SeasonInventory } from "../lib/stats/seasonInventory";
import { buildTeamAt, type HistoryMatch } from "../lib/picks/backtest";
import { compareTeams } from "../lib/stats/compare";
import { computeRatings, RATING_OPTIONS } from "../lib/stats/ratings";
import { DEFAULT_TUNING } from "../lib/stats/predict";
import { stabilizedSeasonBaseline } from "../lib/stats/seasonBaseline";
import { benchmarkTrainingBefore, scoreForecasts, pairedForecastInterval, validateForecast, type BenchmarkRow, type ForecastVector } from "../lib/picks/forecastBenchmark";

const cutoff="2026-09-20", keys=["hardSwitch20","stabilized100","leagueFrequency"];
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const started=performance.now(),history:HistoryMatch[]=[], sources:Array<{file:string;hash:string}>=[];
for(const league of PUBLIC_CLUB_LEAGUES)for(const season of [2025,2026]){
  const file=`.cache/season-inventories/${cutoff}-${league.id}-${season}.json`;
  const inventory=JSON.parse(readFileSync(file,"utf8")) as SeasonInventory;
  if(inventory.leagueId!==league.id||inventory.season!==season||inventory.sha256!==hash(inventory.fixtures)||inventory.pagination.total!==1||inventory.count!==inventory.fixtures.length)throw Error(`INVALID_INVENTORY ${file}`);
  sources.push({file,hash:hash(inventory)});
  for(const r of inventory.fixtures){
    if(r.status!=="FT"||classifyCompetitionRound(r.round)!=="REGULAR_SEASON"||Date.parse(r.kickoff)+10800000>=Date.parse(cutoff))continue;
    if(![r.homeGoals,r.awayGoals].every(x=>x!==null&&Number.isInteger(x)&&x>=0)||!Number.isFinite(Date.parse(r.kickoff))||r.homeTeamId===r.awayTeamId)throw Error("INVALID_FIXTURE");
    history.push({fixtureId:r.fixtureId,leagueId:league.id,season,date:new Date(r.kickoff).toISOString(),homeId:r.homeTeamId,awayId:r.awayTeamId,homeName:String(r.homeTeamId),awayName:String(r.awayTeamId),homeLogo:"",awayLogo:"",homeGoals:r.homeGoals!,awayGoals:r.awayGoals!});
  }
}
history.sort((a,b)=>a.date.localeCompare(b.date)||a.fixtureId-b.fixtureId);
if(new Set(history.map(r=>r.fixtureId)).size!==history.length)throw Error("DUPLICATE_FIXTURE");
const rows:BenchmarkRow[]=[],excluded:Record<string,number>={}, origins:Array<{leagueId:number;asOf:string;latestTrainingKickoff:string;trainingCount:number}>=[];
const reject=(why:string)=>{excluded[why]=(excluded[why]??0)+1;};
const totals=(xs:HistoryMatch[])=>({matches:xs.length,homeGoals:xs.reduce((s,r)=>s+r.homeGoals,0),awayGoals:xs.reduce((s,r)=>s+r.awayGoals,0)});
for(const league of PUBLIC_CLUB_LEAGUES){
  const pool=history.filter(r=>r.leagueId===league.id);
  for(const day of [...new Set(pool.filter(r=>r.season===2026).map(r=>r.date.slice(0,10)))]){
    const origin=Date.parse(day),asOf=new Date(origin).toISOString(),train=benchmarkTrainingBefore(pool,origin);
    const current=train.filter(r=>r.season===2026),previous=train.filter(r=>r.season===2025),targets=pool.filter(r=>r.season===2026&&r.date.startsWith(day));
    if(previous.length<100){excluded.INSUFFICIENT_PRIOR=(excluded.INSUFFICIENT_PRIOR??0)+targets.length;continue;}
    origins.push({leagueId:league.id,asOf,latestTrainingKickoff:train.at(-1)!.date,trainingCount:train.length});
    const base=totals(current.length>=20?current:previous),baselines=[{home:base.homeGoals/base.matches,away:base.awayGoals/base.matches},stabilizedSeasonBaseline(totals(current),totals(previous))!];
    const ratingPool=train.filter(r=>Date.parse(r.date)>=origin-540*86400000);
    const tables=baselines.map(b=>computeRatings(ratingPool,asOf,{...RATING_OPTIONS,...b,xgWeight:0}));
    const simple:ForecastVector={over:train.filter(r=>r.homeGoals+r.awayGoals>2).length/train.length,oneXTwo:[train.filter(r=>r.homeGoals>r.awayGoals).length/train.length,train.filter(r=>r.homeGoals===r.awayGoals).length/train.length,train.filter(r=>r.homeGoals<r.awayGoals).length/train.length]};
    for(const fixture of targets){
      const home=buildTeamAt(train,fixture.homeId,{name:fixture.homeName,logoUrl:"",leagueId:league.id},asOf,2026),away=buildTeamAt(train,fixture.awayId,{name:fixture.awayName,logoUrl:"",leagueId:league.id},asOf,2026);
      if(home.leagueMatches.length<5||away.leagueMatches.length<5||!tables.every(t=>t.has(fixture.homeId)&&t.has(fixture.awayId))){reject("TEAM_SAMPLE");continue;}
      const predictions=baselines.map((baseline,i)=>compareTeams(home,away,new Date(asOf),{baseline,tuning:{...DEFAULT_TUNING,xgWeight:0},strength:{home:tables[i].get(fixture.homeId)!,away:tables[i].get(fixture.awayId)!}},{crossSeasonForm:true}).prediction);
      if(predictions.some(p=>!p?.available)){reject("MODEL_UNAVAILABLE");continue;}
      const forecasts=predictions.map(p=>({over:p!.over25,oneXTwo:[p!.homeWin,p!.draw,p!.awayWin] as [number,number,number]}));
      if(![...forecasts,simple].every(validateForecast))throw Error("INVALID_PROBABILITIES");
      rows.push({fixtureId:fixture.fixtureId,leagueId:league.id,date:fixture.date,homeGoals:fixture.homeGoals,awayGoals:fixture.awayGoals,forecasts:{hardSwitch20:forecasts[0],stabilized100:forecasts[1],leagueFrequency:simple}});
    }
  }
  console.error(`Completed league ${league.id}`);
}
rows.sort((a,b)=>a.date.localeCompare(b.date)||a.fixtureId-b.fixtureId);
const report={version:1,kind:"GOALS_ONLY_RECONSTRUCTION",activation:"NONE",cutoff,datasetHash:hash(history),sourceHash:hash(sources),forecastHash:hash(rows),sources,history:history.length,excluded,origins,
  limitations:["No frozen production predictions or ingestion-time proof. Not a full production-model evaluation.","No xG: equal goals-only inputs, not comparable to earlier xG replay.","Already explored historical period; not untouched holdout. No fitting or tuning performed.","No odds: profitability, market edge and CLV cannot be inferred.","Regular-season leagues only; same-day outcomes excluded with three-hour completion margin."],
  overall:scoreForecasts(rows,keys),comparisons:["hardSwitch20","leagueFrequency"].map(baseline=>({candidate:"stabilized100",baseline,over:pairedForecastInterval(rows,"stabilized100",baseline,"over"),oneXTwo:pairedForecastInterval(rows,"stabilized100",baseline,"oneXTwo")})),
  leagues:PUBLIC_CLUB_LEAGUES.map(l=>({id:l.id,name:l.name,metrics:scoreForecasts(rows.filter(r=>r.leagueId===l.id),keys)})),rows,
  runtime:{seconds:(performance.now()-started)/1000,rssBytes:process.memoryUsage().rss,providerCalls:0,databaseQueries:0}};
mkdirSync(".runtime/goal-benchmark",{recursive:true});
const output=`.runtime/goal-benchmark/${new Date().toISOString().replaceAll(":","-")}.json`;
writeFileSync(output,JSON.stringify(report),{flag:"wx"});
console.log(JSON.stringify({output,n:rows.length,excluded,overall:report.overall,comparisons:report.comparisons,runtime:report.runtime},null,2));
