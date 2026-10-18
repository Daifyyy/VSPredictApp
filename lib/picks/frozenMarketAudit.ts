export interface FrozenSignalRow {
  id:string; fixtureId:number; market:string; side:string; line:number|null;
  modelVersion:number; contextVersion:number; modelContext:string; policyVersion:number;
  kickoff:string; openedAt:string; modelProbability:number; openMarketProbability:number;
  fixtureStatus:string|null; homeGoals:number|null; awayGoals:number|null;
}
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const validProbability=(p:number)=>Number.isFinite(p)&&p>=0&&p<=1;
const loss=(p:number,y:number)=>-Math.log(Math.max(1e-12,y?p:1-p));
export function auditFrozenMarkets(input:FrozenSignalRow[],asOf:string){
  if(!Number.isFinite(Date.parse(asOf)))throw Error("INVALID_CUTOFF");
  const candidates=input.filter(r=>r.market==="OVER_25"||r.market==="1X2");
  const grain=(r:FrozenSignalRow)=>`${r.fixtureId}/${r.market}/${r.policyVersion}`;
  const counts=new Map<string,number>();for(const r of candidates)counts.set(grain(r),(counts.get(grain(r))??0)+1);
  const excluded:Record<string,number>={},groups=new Map<string,Array<{fixtureId:number;day:string;p:number;q:number;y:number}>>();
  for(const r of candidates){
    let reason:string|null=null;
    if(counts.get(grain(r))!==1)reason="DUPLICATE_GRAIN";
    else if(!Number.isFinite(Date.parse(r.openedAt))||!Number.isFinite(Date.parse(r.kickoff)))reason="INVALID_TIME";
    else if(Date.parse(r.openedAt)>=Date.parse(r.kickoff))reason="NOT_PREMATCH";
    else if(Date.parse(r.kickoff)>=Date.parse(asOf))reason="NOT_STARTED_AT_CUTOFF";
    else if(r.fixtureStatus!=="FT"||![r.homeGoals,r.awayGoals].every(v=>v!==null&&Number.isInteger(v)&&v>=0))reason="NOT_REGULATION_FINAL";
    else if(!validProbability(r.modelProbability)||!validProbability(r.openMarketProbability))reason="INVALID_PROBABILITY";
    else if(r.market==="OVER_25"?(r.line!==2.5||!["OVER","UNDER"].includes(r.side)):(!["HOME","DRAW","AWAY"].includes(r.side)||r.line!==null))reason="INVALID_MARKET_IDENTITY";
    if(reason){excluded[reason]=(excluded[reason]??0)+1;continue;}
    const over=r.market==="OVER_25",reverse=over&&r.side==="UNDER";
    const y=over?Number(r.homeGoals!+r.awayGoals!>2):Number(r.side==="HOME"?r.homeGoals!>r.awayGoals!:r.side==="DRAW"?r.homeGoals===r.awayGoals:r.homeGoals!<r.awayGoals!);
    const key=[r.market,r.modelContext,r.modelVersion,r.contextVersion,r.policyVersion].join("/");
    const group=groups.get(key)??[];group.push({fixtureId:r.fixtureId,day:new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Prague"}).format(new Date(r.kickoff)),p:reverse?1-r.modelProbability:r.modelProbability,q:reverse?1-r.openMarketProbability:r.openMarketProbability,y});groups.set(key,group);
  }
  return {asOf,sourceRows:candidates.length,excluded,cohorts:[...groups].map(([key,rows])=>{
    const blocks=new Map<string,number[]>();for(const r of rows){const b=blocks.get(r.day)??[];b.push(loss(r.p,r.y)-loss(r.q,r.y));blocks.set(r.day,b);}
    const days=[...blocks.values()];let interval:null|{lower:number;upper:number}=null;
    if(rows.length>=20&&days.length>=5){let seed=92111;const samples=Array.from({length:2000},()=>{let sum=0,n=0;for(let i=0;i<days.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;for(const d of days[Math.floor(seed/4294967296*days.length)]){sum+=d;n++;}}return sum/n;}).sort((a,b)=>a-b);interval={lower:samples[49],upper:samples[1949]};}
    return {key,n:rows.length,days:days.length,scope:key.startsWith("1X2/")?"SELECTED_SIDE_BINARY_ONLY":"FULL_BINARY_OVER",modelLogLoss:mean(rows.map(r=>loss(r.p,r.y))),marketLogLoss:mean(rows.map(r=>loss(r.q,r.y))),pairedDelta:mean(rows.map(r=>loss(r.p,r.y)-loss(r.q,r.y))),pairedDay95:interval,modelBrier:mean(rows.map(r=>(r.p-r.y)**2)),marketBrier:mean(rows.map(r=>(r.q-r.y)**2)),meanModelProbability:mean(rows.map(r=>r.p)),meanMarketProbability:mean(rows.map(r=>r.q)),actualRate:mean(rows.map(r=>r.y)),fullOneXTwoAvailable:false};
  })};
}
