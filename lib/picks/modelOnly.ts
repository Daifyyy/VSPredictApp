import { MODEL_ONLY_POLICY } from '../modelOnlyMode';
import { localDateKey } from '../competitionGrouping';
import { poissonVector, drawTau } from '../stats/predict';

export const MODEL_SOURCE_LABELS: Record<string,string> = {
  MAIN_1X2:'Hlavní model 1X2', ORIGINAL_OVER:'Over 2,5 — modelová politika',
  ELO_1X2:'ELO 1X2 · experiment', MODEL_COMBINATION:'Modelová kombinace · experiment (dříve VALUE)', AI_OVER:'AI Over · výzkum',
};
export type ModelForecastInput = {
 fixtureId:number; leagueId:number; homeTeamId:number; awayTeamId:number; homeName:string; awayName:string;
 kickoff:Date; predictedAt:Date; status:string; available:boolean; lowConfidence:boolean; readinessSample:number;
 modelVersion:number; contextVersion:number; modelContext:string; homeWin:number; draw:number; awayWin:number;
 over25:number; lambdaHome:number; lambdaAway:number;
};
export type ModelCandidate = {
 id:string; fixtureId:number; dateKey:string; source:string; artifactId:string; modelVersion:number; contextVersion:number;
 policyVersion:number; modelContext:string; leagueId:number; homeTeamId:number; awayTeamId:number; homeName:string; awayName:string;
 kickoff:Date; capturedAt:Date; sourceAt:Date; market:string; side:string; line:number|null; probability:number; probabilities:number[];
 qualified:boolean; reason:string; readiness:number;
};
export function validProbabilities(p:number[]) { return [2,3].includes(p.length) && p.every(v=>Number.isFinite(v)&&v>=0&&v<=1) && Math.abs(p.reduce((a,b)=>a+b,0)-1)<0.001; }
export function modelCandidate(f:ModelForecastInput,source:string,p:number[],now:Date,options:{artifactId?:string;modelVersion?:number;market?:string;side?:string;line?:number;sample?:number;capturedAt?:Date}={}):ModelCandidate|null {
  const at=options.capturedAt??f.predictedAt;
  if(!f.available||f.status!=='NS'||!Number.isSafeInteger(f.fixtureId)||f.fixtureId<=0||f.homeTeamId===f.awayTeamId||!Number.isFinite(+now)||!Number.isFinite(+f.kickoff)||!validProbabilities(p)||!Number.isFinite(+at)||+at>+now||+at>=+f.kickoff||+f.kickoff<+now+30*60_000||+now-+at>24*3600_000)return null;
  const index=p.indexOf(Math.max(...p));
  const market=options.market??(p.length===3?'1X2':'OVER_25');
  const side=options.side??(p.length===3?['HOME','DRAW','AWAY'][index]:index===1?'OVER':'UNDER');
  const probability=options.side?p[1]:p[index];
  const sample=options.sample??f.readinessSample;
  const threshold=market==='1X2'?0.58:market==='COMBINATION'?0.55:0.60;
  const ready=Number.isFinite(sample)&&sample>=8&&!f.lowConfidence;
  const qualified=ready && probability>=threshold && (market!=='OVER_25'||side==='OVER');
  const version=options.modelVersion??f.modelVersion, artifactId=options.artifactId??'';
  return {id:[MODEL_ONLY_POLICY,f.fixtureId,source,version,f.contextVersion,f.modelContext,artifactId].join(':'),fixtureId:f.fixtureId,dateKey:localDateKey(f.kickoff),source,artifactId,modelVersion:version,contextVersion:f.contextVersion,policyVersion:MODEL_ONLY_POLICY,modelContext:f.modelContext,leagueId:f.leagueId,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeName:f.homeName,awayName:f.awayName,kickoff:f.kickoff,capturedAt:now,sourceAt:at,market,side,line:options.line??(market==='OVER_25'?2.5:null),probability,probabilities:p,qualified,reason:!ready?'INSUFFICIENT_INPUTS':qualified?'MODEL_THRESHOLD_MET':'BELOW_MODEL_THRESHOLD',readiness:Number.isFinite(sample)?sample:0};
}
export function mainModelCandidates(f:ModelForecastInput,now:Date):ModelCandidate[] {
 const result=[modelCandidate(f,'MAIN_1X2',[f.homeWin,f.draw,f.awayWin],now),modelCandidate(f,'ORIGINAL_OVER',[1-f.over25,f.over25],now)];
 // A joint score-grid event, never a product of independent marginal probabilities.
 if(Number.isFinite(f.lambdaHome)&&Number.isFinite(f.lambdaAway)&&f.lambdaHome>0&&f.lambdaAway>0&&f.lambdaHome<10&&f.lambdaAway<10){
  const home=poissonVector(f.lambdaHome),away=poissonVector(f.lambdaAway);const sums=[0,0];let norm=0;
  for(let h=0;h<home.length;h++)for(let a=0;a<away.length;a++){
   const mass=home[h]*away[a]*drawTau(h,a,f.lambdaHome,f.lambdaAway,-0.03);norm+=mass;
   if(h+a<4.5){if(h>a)sums[0]+=mass;if(a>h)sums[1]+=mass;}
  }
  const side=sums[0]>=sums[1]?'HOME':'AWAY', p=Math.max(...sums)/norm;
  result.push(modelCandidate(f,'MODEL_COMBINATION',[1-p,p],now,{market:'COMBINATION',side,line:4.5}));
 }
 return result.filter((v):v is ModelCandidate=>v!=null);
}
export function modelSelectionLabel(row:{market:string;side:string;line:number|null}){
 if(row.market==='COMBINATION')return `${row.side==='HOME'?'Domácí':'Hosté'} vyhrají + méně než ${row.line} gólu`;
 if(row.market==='1X2')return {HOME:'Výhra domácích',DRAW:'Remíza',AWAY:'Výhra hostů'}[row.side]??row.side;
 return row.side==='OVER'?'Více než 2,5 gólu':'Méně než 2,5 gólu';
}
export function accuracyInterval(correct:number,n:number):[number,number]|null{
 if(!n)return null;
 const p=correct/n,z=1.96,d=1+z*z/n,centre=(p+z*z/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
 return [Math.max(0,centre-half),Math.min(1,centre+half)];
}
export function settleModelForecast(row:{market:string;side:string;probabilities:unknown;line:number|null},status:string,home:number|null,away:number|null){
 if(['CANC','ABD','AWD','WO'].includes(status))return {outcome:'VOID',hit:null,actualClass:null,baselineHit:null,brier:null,logLoss:null};
 if(status!=='FT'||home==null||away==null||!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0)return null;
 const probs=row.probabilities as number[];if(!Array.isArray(probs)||!validProbabilities(probs))return null;
 const actualClass=row.market==='1X2'?(home>away?0:home===away?1:2):row.market==='COMBINATION'?Number((row.side==='HOME'?home>away:away>home)&&home+away<(row.line??4.5)):Number(home+away>2.5);
 const predicted=row.market==='1X2'?['HOME','DRAW','AWAY'].indexOf(row.side):row.market==='COMBINATION'?1:row.side==='OVER'?1:0;
 const hit=actualClass===predicted;
 return {outcome:hit?'WON':'LOST',hit,actualClass,baselineHit:row.market==='1X2'?actualClass===0:row.market==='OVER_25'?actualClass===1:null,
  brier:row.market==='1X2'?probs.reduce((sum,p,i)=>sum+(p-Number(i===actualClass))**2,0):(probs[1]-actualClass)**2,
  logLoss:-Math.log(Math.max(1e-9,probs[actualClass]))};
}
/** Append only; no sixth slot after a void/withdrawal, no repeated fixture or >2 league entries. */
export function appendModelDaily<T extends {id:string;fixtureId:number;leagueId:number;probability:number;kickoff:Date;qualified:boolean}>(existing:T[],candidates:T[],now:Date){
 const result=[...existing];for(const c of [...candidates].sort((a,b)=>b.probability-a.probability||+a.kickoff-+b.kickoff||a.id.localeCompare(b.id))){
  if(result.length>=5)break;
  if(!c.qualified||+c.kickoff<+now+30*60_000||result.some(r=>r.fixtureId===c.fixtureId)||result.filter(r=>r.leagueId===c.leagueId).length>=2)continue;
  result.push(c);
 }return result;
}
