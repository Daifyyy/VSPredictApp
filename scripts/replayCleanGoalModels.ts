// Offline diagnostic only. No provider requests, writes to DB, or production activation.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { prisma } from "../lib/db";
import { PUBLIC_CLUB_LEAGUES } from "../lib/data/catalog";
import { classifyCompetitionRound } from "../lib/stats/seasonPhases";
import type { SeasonInventory } from "../lib/stats/seasonInventory";
import { buildTeamAt, type HistoryMatch } from "../lib/picks/backtest";
import { compareTeams } from "../lib/stats/compare";
import { computeRatings, RATING_OPTIONS } from "../lib/stats/ratings";
import { DEFAULT_TUNING } from "../lib/stats/predict";
import { stabilizedSeasonBaseline } from "../lib/stats/seasonBaseline";

const cutoff = "2026-09-20";
const mean = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const loss = (p: number, y: number) => -Math.log(Math.max(1e-9, y ? p : 1-p));
type Forecast = { over: number; btts: number; goals: number };
type Row = { fixtureId: number; leagueId: number; date: string; over: number; btts: number; goals: number; forecasts: Record<string, Forecast> };
const rows: Row[] = [];
function summary(xs: Row[]) {
  return Object.fromEntries(["original", "prior100", "leagueFrequency"].map(key => {
    const calibration = (market: "over" | "btts") => {
      const bins = Array.from({length:10},(_,i)=> {
        const group=xs.filter(x=>Math.min(9,Math.floor(x.forecasts[key][market]*10))===i);
        return { lower:i/10, n:group.length, predicted:mean(group.map(x=>x.forecasts[key][market])), actual:mean(group.map(x=>x[market])) };
      });
      return { logLoss:mean(xs.map(x=>loss(x.forecasts[key][market],x[market]))), brier:mean(xs.map(x=>(x.forecasts[key][market]-x[market])**2)), predicted:mean(xs.map(x=>x.forecasts[key][market])), actual:mean(xs.map(x=>x[market])), ece:xs.length?bins.reduce((s,b)=>s+b.n*Math.abs((b.predicted??0)-(b.actual??0)),0)/xs.length:null, bins:process.argv.includes("--compact")?undefined:bins };
    };
    return [key,{n:xs.length,over:calibration("over"),btts:calibration("btts"),goalMAE:mean(xs.map(x=>Math.abs(x.forecasts[key].goals-x.goals))),goalBias:mean(xs.map(x=>x.forecasts[key].goals-x.goals))}];
  }));
}
async function main() {
  const history: HistoryMatch[] = [];
  for(const league of PUBLIC_CLUB_LEAGUES) for(const season of [2025,2026]) {
    const inventory = JSON.parse(readFileSync(`.cache/season-inventories/${cutoff}-${league.id}-${season}.json`,"utf8")) as SeasonInventory;
    if(inventory.sha256!==createHash("sha256").update(JSON.stringify(inventory.fixtures)).digest("hex") || inventory.pagination.total!==1 || inventory.count!==inventory.fixtures.length) throw Error("Inventory integrity failed");
    for(const r of inventory.fixtures) {
      if(r.status!=="FT" || classifyCompetitionRound(r.round)!=="REGULAR_SEASON" || Date.parse(r.kickoff)+10800000>=Date.parse(cutoff) || r.homeGoals===null || r.awayGoals===null) continue;
      history.push({fixtureId:r.fixtureId,leagueId:league.id,season,date:new Date(r.kickoff).toISOString(),homeId:r.homeTeamId,awayId:r.awayTeamId,homeName:String(r.homeTeamId),awayName:String(r.awayTeamId),homeLogo:"",awayLogo:"",homeGoals:r.homeGoals,awayGoals:r.awayGoals});
    }
  }
  history.sort((a,b)=>a.date.localeCompare(b.date)||a.fixtureId-b.fixtureId);
  if(new Set(history.map(x=>x.fixtureId)).size!==history.length) throw Error("Duplicate fixture");
  const stats=await prisma.matchStatCache.findMany({where:{fixtureId:{in:history.map(x=>x.fixtureId)},context:"league"},select:{fixtureId:true,teamId:true,xg:true}});
  const index=new Map<string,typeof stats>();
  for(const s of stats) { const key=`${s.fixtureId}:${s.teamId}`; index.set(key,[...(index.get(key)??[]),s]); }
  for(const h of history) {
    const home=index.get(`${h.fixtureId}:${h.homeId}`),away=index.get(`${h.fixtureId}:${h.awayId}`);
    if(home?.length===1 && home[0].xg!==null) h.homeMetrics={XG:home[0].xg};
    if(away?.length===1 && away[0].xg!==null) h.awayMetrics={XG:away[0].xg};
  }
  let excluded=0;
  for(const league of PUBLIC_CLUB_LEAGUES) {
    const pool=history.filter(x=>x.leagueId===league.id);
    for(const day of [...new Set(pool.filter(x=>x.season===2026).map(x=>x.date.slice(0,10)))]) {
      const origin=Date.parse(day),asOf=new Date(origin).toISOString();
      const train=pool.filter(x=>Date.parse(x.date)+10800000<origin);
      const current=train.filter(x=>x.season===2026),previous=train.filter(x=>x.season===2025);
      if(previous.length<100) {excluded+=pool.filter(x=>x.date.startsWith(day)&&x.season===2026).length;continue;}
      const totals=(xs:HistoryMatch[])=>({matches:xs.length,homeGoals:xs.reduce((s,x)=>s+x.homeGoals,0),awayGoals:xs.reduce((s,x)=>s+x.awayGoals,0)});
      const base=totals(current.length>=20?current:previous);
      const baselines=[{home:base.homeGoals/base.matches,away:base.awayGoals/base.matches},stabilizedSeasonBaseline(totals(current),totals(previous))!];
      const ratingPool=train.filter(x=>Date.parse(x.date)>=origin-540*86400000).map(x=>({...x,homeXg:x.homeMetrics?.XG,awayXg:x.awayMetrics?.XG}));
      const tables=baselines.map(b=>computeRatings(ratingPool,asOf,{...RATING_OPTIONS,...b,xgWeight:DEFAULT_TUNING.xgWeight}));
      const simple={over:train.filter(x=>x.homeGoals+x.awayGoals>=3).length/train.length,btts:train.filter(x=>x.homeGoals>0&&x.awayGoals>0).length/train.length,goals:train.reduce((s,x)=>s+x.homeGoals+x.awayGoals,0)/train.length};
      for(const fixture of pool.filter(x=>x.season===2026&&x.date.startsWith(day))) {
        const home=buildTeamAt(train,fixture.homeId,{name:fixture.homeName,logoUrl:"",leagueId:league.id},asOf,2026);
        const away=buildTeamAt(train,fixture.awayId,{name:fixture.awayName,logoUrl:"",leagueId:league.id},asOf,2026);
        if(home.leagueMatches.length<5||away.leagueMatches.length<5||!tables.every(t=>t.has(fixture.homeId)&&t.has(fixture.awayId))) {excluded++;continue;}
        const predictions=baselines.map((baseline,i)=>compareTeams(home,away,new Date(asOf),{baseline,tuning:DEFAULT_TUNING,strength:{home:tables[i].get(fixture.homeId)!,away:tables[i].get(fixture.awayId)!}},{crossSeasonForm:true}).prediction);
        if(predictions.some(p=>!p?.available)) {excluded++;continue;}
        const f=predictions.map(p=>({over:p!.over25,btts:p!.bttsYes,goals:p!.lambdaHomeBase+p!.lambdaAwayBase}));
        rows.push({fixtureId:fixture.fixtureId,leagueId:league.id,date:fixture.date,over:Number(fixture.homeGoals+fixture.awayGoals>=3),btts:Number(fixture.homeGoals>0&&fixture.awayGoals>0),goals:fixture.homeGoals+fixture.awayGoals,forecasts:{original:f[0],prior100:f[1],leagueFrequency:simple}});
      }
    }
    console.error(`Completed ${league.id}`);
  }
  console.log(JSON.stringify({cutoff,method:"DAILY_ORIGIN_REGULAR_SEASON_SHARED_COHORT",datasetHash:createHash("sha256").update(JSON.stringify(history)).digest("hex"),history:history.length,excluded,activation:"NONE",limitations:["Retrospective reconstruction, not frozen production predictions.","Original means current model core and hard switch at 20 on clean results, not historic cached standings.","2025 warm-up; 2026 validation has already been explored, not untouched holdout.","Only regular-season matches, current cached xG revisions; ingestion-time availability unproven.","Midnight UTC origin plus 3h completion margin. Same-day outcomes excluded.","No market comparison; no proof of profitable edge. Small league segments are descriptive."],overall:summary(rows),leagues:PUBLIC_CLUB_LEAGUES.map(l=>({id:l.id,name:l.name,metrics:summary(rows.filter(x=>x.leagueId===l.id))})),rows:process.argv.includes("--compact")?undefined:rows},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
