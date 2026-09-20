// Read-only, offline, monthly rolling-origin replay. Never imported by production.
import { prisma } from "../lib/db";
import { loadSeasonResults } from "../lib/data/seasonResults";
import { seasonResultTotals } from "../lib/stats/seasonResults";
import { CLUB_LEAGUES, isPublicClubLeague } from "../lib/data/catalog";
import { computeRatings, RATING_OPTIONS, type RatingMatch } from "../lib/stats/ratings";
import { DEFAULT_TUNING, dampenTotal, gridProbs } from "../lib/stats/predict";
import { stabilizedSeasonBaseline } from "../lib/stats/seasonBaseline";
import type { ApiStandingRow } from "../lib/data/apiFootball";
const cutoffArg = process.argv.find(arg => arg.startsWith("--cutoff="))?.split("=")[1] ?? "2026-09-20";
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffArg)) throw new Error("Expected --cutoff=YYYY-MM-DD (exclusive UTC date)");
const cutoff = new Date(`${cutoffArg}T00:00:00Z`);
if (!Number.isFinite(cutoff.getTime()) || cutoff.toISOString().slice(0, 10) !== cutoffArg) throw new Error("Invalid cutoff");
const validationSeason = cutoff.getUTCFullYear();
const avg=(v:number[])=>v.length?v.reduce((s,x)=>s+x,0)/v.length:null;
const loss=(p:number,y:boolean)=>-Math.log(Math.max(1e-9,y?p:1-p));
async function main() {
 const ids=CLUB_LEAGUES.map(l=>l.id);
 const canonical=await loadSeasonResults(ids, validationSeason-3, cutoff);
 const history=canonical.matches;
 const stats=await prisma.matchStatCache.findMany({where:{fixtureId:{in:history.map(x=>x.fixtureId)},context:"league"},select:{fixtureId:true,teamId:true,xg:true}});
 const xg=new Map<string, number | null>();
 const ambiguous=new Set<string>();
 for(const row of stats){
  const key=row.fixtureId+":"+row.teamId;
  if(xg.has(key))ambiguous.add(key);
  else xg.set(key,row.xg);
 }
 // Never let row order arbitrarily choose among duplicate statistical records.
 for(const key of ambiguous)xg.delete(key);
 const cache=await prisma.apiCache.findMany({where:{key:{startsWith:"standings:"}},select:{key:true,payload:true,updatedAt:true}});
 const out:Array<{leagueId:number;season:number;fixtureId:number;date:string;currentMatches:number;oldLL:number;newLL:number;oldBtts:number;newBtts:number;oldMAE:number;newMAE:number;oldExpected:number;newExpected:number;actual:number}>=[];
 const standingsTotals=(season:number,id:number)=>{
   const row=cache.find(r=>r.key===`standings:${id}:${season}`);
   if(!row||!Array.isArray(row.payload))return null;
   const teams=row.payload as unknown as ApiStandingRow[];
   const h=teams.reduce((s,r)=>s+(r.home?.played??0),0),a=teams.reduce((s,r)=>s+(r.away?.played??0),0);
   if(h!==a||h===0)return null;
   return {matches:h,homeGoals:teams.reduce((s,r)=>s+(r.home?.goals?.for??0),0),awayGoals:teams.reduce((s,r)=>s+(r.away?.goals?.for??0),0),sourceAt:row.updatedAt,rows:teams.length,uniqueTeams:new Set(teams.map(r=>r.team.id)).size};
 };
 for(const id of ids){
  const league=history.filter(r=>r.leagueId===id);
  const months=[...new Set(league.filter(r=>r.season>=validationSeason-1).map(r=>r.kickoff.toISOString().slice(0,7)))];
  for(const month of months){
   const asOf=new Date(month+"-01T00:00:00Z");
   const test=league.filter(r=>r.kickoff.toISOString().startsWith(month)&&r.season>=validationSeason-1);
   for(const season of [...new Set(test.map(r=>r.season))]){
    const current=seasonResultTotals(league,id,season,asOf);
    const previous=seasonResultTotals(league,id,season-1,asOf);
    if(previous.matches<100)continue;
    const base=current.matches>=20?current:previous;
    const old={home:base.homeGoals/base.matches,away:base.awayGoals/base.matches};
    const next=stabilizedSeasonBaseline(current,previous)!;
    const train=league.filter(r=>r.kickoff.getTime()+3*3600_000<asOf.getTime()&&r.kickoff.getTime()>=asOf.getTime()-540*86400_000);
    if(train.length<30)continue;
    const matches:RatingMatch[]=train.map(r=>({date:r.kickoff.toISOString(),homeId:r.homeTeamId,awayId:r.awayTeamId,homeGoals:r.homeGoals,awayGoals:r.awayGoals,homeXg:xg.get(r.fixtureId+":"+r.homeTeamId)??undefined,awayXg:xg.get(r.fixtureId+":"+r.awayTeamId)??undefined}));
    const tables=[old,next].map(b=>computeRatings(matches,asOf.toISOString(),{...RATING_OPTIONS,xgWeight:DEFAULT_TUNING.xgWeight,...b}));
    for(const r of test.filter(r=>r.season===season)){
     if(!tables.every(t=>t.has(r.homeTeamId)&&t.has(r.awayTeamId)))continue;
     const pred=[old,next].map((b,i)=>{
      const h=tables[i].get(r.homeTeamId)!,a=tables[i].get(r.awayTeamId)!;
      const [lh,la]=dampenTotal(Math.min(5,Math.max(.2,b.home*h.attack*a.defense)),Math.min(5,Math.max(.2,b.away*a.attack*h.defense)),b,DEFAULT_TUNING.totalSpread);
      return {sum:lh+la,...gridProbs(lh,la)};
     });
     const actual=r.homeGoals+r.awayGoals,y=actual>=3,btts=r.homeGoals>0&&r.awayGoals>0;
     out.push({leagueId:id,season,fixtureId:r.fixtureId,date:r.kickoff.toISOString(),currentMatches:current.matches,oldLL:loss(pred[0].over25,y),newLL:loss(pred[1].over25,y),oldBtts:loss(pred[0].bttsYes,btts),newBtts:loss(pred[1].bttsYes,btts),oldMAE:Math.abs(pred[0].sum-actual),newMAE:Math.abs(pred[1].sum-actual),oldExpected:pred[0].sum,newExpected:pred[1].sum,actual});
    }
   }
  }
 }
 const summary=(xs:typeof out)=>({n:xs.length,oldLL:avg(xs.map(x=>x.oldLL)),newLL:avg(xs.map(x=>x.newLL)),deltaLL:avg(xs.map(x=>x.newLL-x.oldLL)),oldBtts:avg(xs.map(x=>x.oldBtts)),newBtts:avg(xs.map(x=>x.newBtts)),oldMAE:avg(xs.map(x=>x.oldMAE)),newMAE:avg(xs.map(x=>x.newMAE)),oldExpected:avg(xs.map(x=>x.oldExpected)),newExpected:avg(xs.map(x=>x.newExpected)),actual:avg(xs.map(x=>x.actual))});
 console.log(JSON.stringify({cutoff,method:"MONTHLY_ROLLING_RECONSTRUCTION_FIXED_PRIOR_100",activation:"NOT_ACTIVATED_MIXED_RESULTS",limitations:["Reconstructed history: historical availability/revisions of xG not proven.","Both variants retrain ratings on the same 540-day pool before each month.","All historical league teams; production may exclude relegated teams. Fixtures without both rated teams are excluded.","BTTS here uses score-grid probability, not the production frequency blend.","2026 is temporal validation, not untouched research: previous audit already inspected some outcomes.","Fixed prior 100 is an exploratory candidate, not a tuned or validated parameter.","Current cached standings are descriptive only, never used as historical replay inputs.","No inference about beating market: this replay does not contain matched opening prices."],history:history.length,ambiguousStatKeys:ambiguous.size,
   resultSource:{method:canonical.method,duplicateRows:canonical.duplicateRows,rejected:canonical.rejected,coverage:"UNKNOWN",availability:"RECONSTRUCTED_NOT_INGESTION_TIME"},
   seasonSources:CLUB_LEAGUES.map(l=>({leagueId:l.id,active:isPublicClubLeague(l.id),current:seasonResultTotals(history,l.id,validationSeason,cutoff),previous:seasonResultTotals(history,l.id,validationSeason-1,cutoff)})),
   activeDevelopment:summary(out.filter(x=>isPublicClubLeague(x.leagueId)&&x.season===validationSeason-1)),activeValidation:summary(out.filter(x=>isPublicClubLeague(x.leagueId)&&x.season===validationSeason)),
   development:summary(out.filter(x=>x.season===validationSeason-1)),validation:summary(out.filter(x=>x.season===validationSeason)),
   leagues:CLUB_LEAGUES.map(l=>{const current=standingsTotals(validationSeason,l.id),previous=standingsTotals(validationSeason-1,l.id);const duplicateTeams=!!((current && current.rows!==current.uniqueTeams)||(previous && previous.rows!==previous.uniqueTeams));return {id:l.id,name:l.name,active:isPublicClubLeague(l.id),current,previous,qualityIssues:[...(!current?["CURRENT_STANDINGS_UNAVAILABLE"]:[]),...(!previous?["PREVIOUS_STANDINGS_UNAVAILABLE"]:[]),...(duplicateTeams?["DUPLICATE_TEAMS_OR_OVERLAPPING_PHASES"]:[])],candidate:duplicateTeams?null:stabilizedSeasonBaseline(current,previous),development:summary(out.filter(x=>x.leagueId===l.id&&x.season===validationSeason-1)),validation:summary(out.filter(x=>x.leagueId===l.id&&x.season===validationSeason)),earlySeason:summary(out.filter(x=>x.leagueId===l.id&&x.currentMatches<100))};})
 },null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
