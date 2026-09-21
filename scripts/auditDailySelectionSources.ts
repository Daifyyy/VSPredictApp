/** Read-only diagnostic. No provider requests or production writes. */
import { prisma } from "../lib/db";
import { AUTONOMOUS_POLICY_VERSION } from "../lib/picks/autonomousPortfolio";
import { probabilityMetrics } from "../lib/picks/modelLab";

async function main() {
  const at = new Date();
  const [tips, signals, legs] = await Promise.all([
    prisma.autonomousTipSnapshot.findMany({where:{status:"candidate"},select:{id:true,fixtureId:true,strategy:true,policyVersion:true,modelVersion:true,countModelVersion:true,modelContext:true,market:true,side:true,line:true,kickoff:true,qualifiedAt:true,capturedAt:true,decimalOdds:true,bookmaker:true,modelProbability:true,marketProbability:true,hit:true,settledAt:true,settlementStatus:true,priceClv:true,clvMethodVersion:true,closingFreshness:true,closingBenchmarkQuality:true}}),
    prisma.marketSignalSnapshot.groupBy({by:["policyVersion","market","modelVersion","modelContext"],_count:true,_min:{openedAt:true},_max:{openedAt:true}}),
    prisma.intuitionTicketLeg.findMany({select:{fixtureId:true,winner:true,totalSide:true,totalLine:true,priceKind:true,decimalOdds:true,hit:true,settledAt:true,modelPredictionVersion:true,clvMethodVersion:true,priceClv:true,kickoff:true,ticket:{select:{strategy:true,policyVersion:true,lockedAt:true}}}}),
  ]);
  const groups = new Map<string,typeof tips>();
  for(const r of tips) {
    const key=JSON.stringify([r.strategy,r.policyVersion,r.modelVersion,r.countModelVersion,r.modelContext,r.market]);
    groups.set(key,[...(groups.get(key)??[]),r]);
  }
  const summary=(xs:typeof tips)=>{
    const priced=xs.filter(r=>r.hit!=null&&r.settledAt!=null&&r.settledAt<at&&r.qualifiedAt!=null&&r.qualifiedAt<r.kickoff&&r.decimalOdds!=null&&r.decimalOdds>=1.5&&r.decimalOdds<=3);
    const matches=priced.filter(r=>Number.isFinite(r.modelProbability)&&Number.isFinite(r.marketProbability)&&r.marketProbability>0&&r.marketProbability<1);
    const profit=priced.reduce((s,r)=>s+(r.hit?r.decimalOdds!-1:-1),0);
    const metrics=(field:"modelProbability"|"marketProbability")=>probabilityMetrics(matches.map(r=>({probability:r[field],outcome:r.hit!})));
    return {total:xs.length,pricedSettled:priced.length,days:new Set(priced.map(r=>r.kickoff.toISOString().slice(0,10))).size,first:priced.length?priced.map(r=>r.kickoff.toISOString()).sort()[0]:null,last:priced.length?priced.map(r=>r.kickoff.toISOString()).sort().at(-1):null,profit,roi:priced.length?profit/priced.length:null,model:metrics("modelProbability"),market:metrics("marketProbability"),clvV2:priced.filter(r=>r.clvMethodVersion===2).length,primaryPanel:priced.filter(r=>r.closingFreshness==="PRIMARY_30"&&r.closingBenchmarkQuality==="PANEL"&&r.priceClv!=null).length,
      oddsBuckets:[1.5,2,2.5].map(lo=>{const rows=priced.filter(r=>r.decimalOdds!>=lo&&(lo===2.5?r.decimalOdds!<=3:r.decimalOdds!<lo+.5));return {lo,n:rows.length,hits:rows.filter(r=>r.hit).length,profit:rows.reduce((s,r)=>s+(r.hit?r.decimalOdds!-1:-1),0)};})};
  };
  const legGroups=new Map<string,typeof legs>();
  for(const l of legs){const key=JSON.stringify([l.ticket.strategy,l.ticket.policyVersion,l.modelPredictionVersion,l.priceKind]);legGroups.set(key,[...(legGroups.get(key)??[]),l]);}
  console.log(JSON.stringify({at,scope:"Source audit; not a daily-selection backtest; no inferred historical quote freshness",autonomous:[...groups].map(([key,xs])=>({key,activePolicy:AUTONOMOUS_POLICY_VERSION[xs[0].strategy as keyof typeof AUTONOMOUS_POLICY_VERSION]===xs[0].policyVersion,...summary(xs)})),marketSignals:signals,ticketLegs:[...legGroups].map(([key,xs])=>{
    const unique=new Map<string,typeof xs[number]>();for(const l of [...xs].sort((a,b)=>a.ticket.lockedAt.getTime()-b.ticket.lockedAt.getTime())){const id=`${l.fixtureId}:${l.winner}:${l.totalSide}:${l.totalLine}`;if(!unique.has(id))unique.set(id,l);}
    const settled=[...unique.values()].filter(l=>l.ticket.lockedAt<l.kickoff&&l.hit!=null&&l.settledAt!=null&&l.decimalOdds!=null&&l.decimalOdds>=1.5&&l.decimalOdds<=3);
    return {key,rows:xs.length,unique:unique.size,settled:settled.length,profit:settled.reduce((s,l)=>s+(l.hit?l.decimalOdds!-1:-1),0),clvV2:settled.filter(l=>l.clvMethodVersion===2).length};
  })},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
