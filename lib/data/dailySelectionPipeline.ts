import "server-only";
import { prisma } from "../db";
import { dailySelectionConfig } from "../dailySelectionConfig";
import { localDateKey } from "../competitionGrouping";
import { loadDailyAutonomousSources } from "./dailySelectionSources";
import { loadDailyAdditionalSources } from "./dailySelectionAdditionalSources";
import { appendDailySelection } from "./dailySelectionStore";
import { refreshDailySelectionBalances, settleDailySelection } from "./dailySelectionLifecycle";
import { refreshDailyAutonomousEvidence } from "./dailySelectionEvidenceStore";
import { upsertIncident } from "../operations";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { dailyCandidateRejection } from "../picks/dailySelection";
import type { DailyPublicationCandidate } from "./dailySelectionStore";

async function auditPublished(candidates:DailyPublicationCandidate[],now:Date){
  const items=await prisma.dailySelectionItem.findMany({where:{day:{dateKey:localDateKey(now)},kickoff:{gt:now},outcome:"PENDING"}});
  for(const item of items){
    const c=candidates.find(c=>c.fixtureId===item.fixtureId&&c.marketKey===item.marketKey&&(item.snapshot as unknown as DailyPublicationCandidate).strategy===c.strategy);
    const reason=c?dailyCandidateRejection(c,now):"SOURCE_NO_LONGER_AVAILABLE";
    // Near kickoff is the admission cutoff, not a reason to withdraw an existing bet.
    const warning=reason==="KICKOFF_TOO_CLOSE"?null:reason;
    const withdrawn=warning==="SOURCE_BLOCKED"||warning==="SOURCE_NOT_QUALIFIED"||warning==="INVALID_IDENTITY";
    const priceChanged=c&&c.odds!==item.decimalOdds;
    if(!warning&&!priceChanged)continue;
    const kind=withdrawn?"WITHDRAWN":priceChanged?"PRICE_CHANGED":"WARNING";
    const eventKey=`audit:${item.id}:${kind}:${warning??c?.odds}`;
    await prisma.$transaction(async tx=>{
      await tx.dailySelectionEvent.upsert({where:{eventKey},create:{eventKey,dayId:item.dayId,itemId:item.id,kind,payload:{reason:warning,newOdds:c?.odds??null,newQuoteAt:c?.oddsAt??null,at:now.toISOString()}},update:{}});
      if(withdrawn)await tx.dailySelectionItem.update({where:{id:item.id},data:{status:"WITHDRAWN"}});
    });
  }
}

export async function loadDailySources(date:string,now:Date) {
  const [autonomous,additional,incidents,definitions]=await Promise.all([
    loadDailyAutonomousSources(date,now),loadDailyAdditionalSources(date,now),
    prisma.dataIncident.findMany({where:{status:"OPEN",severity:"CRITICAL"},select:{details:true}}),
    prisma.modelStrategyDefinition.findMany({where:{status:{in:["REJECTED","RETIRED","PAUSED"]}},select:{strategy:true,modelVersion:true,policyVersion:true,modelContext:true}}),
  ]);
  const candidates=[...autonomous.candidates,...additional.candidates].map(c=>{
    const scope=JSON.parse(c.cohortKey) as [string,string,number,number,string];
    const blocked=definitions.some(d=>d.strategy===c.strategy&&d.policyVersion===scope[2]&&d.modelVersion===scope[3]&&d.modelContext===scope[4])||incidents.some(i=>{
      const d=i.details as {fixtureId?:number;fixtureIds?:number[];leagueId?:number;strategy?:string;scope?:string}|null;
      return d?.scope==="GLOBAL"||d?.fixtureId===c.fixtureId||d?.fixtureIds?.includes(c.fixtureId)||d?.leagueId===c.leagueId||d?.strategy===c.strategy;
    });return {...c,blocked:c.blocked||blocked};
  });
  return {candidates,rejected:[...autonomous.rejected,...additional.rejected]};
}

/** Isolated optional workflow: provider calls are forbidden here. */
export async function runDailySelection(now=new Date(),options:{dryRun?:boolean;settle?:boolean}={}) {
  if(!dailySelectionConfig().collect&&!options.dryRun)return {status:"DISABLED"};
  const leaseKey="daily-selection:lease",owner=randomUUID();let leased=false;
  try {
    if(!options.dryRun){
      const expiresAt=new Date(now.getTime()+90_000),payload={owner};
      try{await prisma.apiCache.create({data:{key:leaseKey,payload,expiresAt}});leased=true;}
      catch(error){
        if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=="P2002")throw error;
        leased=(await prisma.apiCache.updateMany({where:{key:leaseKey,expiresAt:{lte:now}},data:{payload,expiresAt}})).count===1;
      }
      if(!leased)return {status:"LEASE_HELD"};
    }
    if(options.settle&&!options.dryRun){
      const result=await settleDailySelection(now);
      await refreshDailySelectionBalances(now);
      await refreshDailyAutonomousEvidence(now,true);
      return {status:"SETTLED",...result};
    }
    const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Prague",hour:"2-digit",hourCycle:"h23"}).format(now));
    if(hour<9)return {status:"BEFORE_PUBLICATION"};
    const sources=await loadDailySources(localDateKey(now),now);
    if(!options.dryRun)await auditPublished(sources.candidates,now);
    const result=await appendDailySelection(sources.candidates,now,options.dryRun,sources.rejected);
    if(!options.dryRun&&"added" in result&&result.added)await refreshDailySelectionBalances(now);
    return {...result,sourceRejections:sources.rejected};
  } catch(error){
    if(options.dryRun)throw error;
    // This feature must not fail an existing odds/prediction/settlement job.
    await upsertIncident({fingerprint:"daily-selection:pipeline",kind:"DAILY_SELECTION",severity:"WARNING",message:"Denní výběr se nepodařilo aktualizovat.",details:{error:error instanceof Error?error.message:String(error)}}).catch(()=>undefined);
    return {status:"FAILED"};
  }finally{
    if(leased)await prisma.apiCache.deleteMany({where:{key:leaseKey,payload:{path:["owner"],equals:owner}}}).catch(()=>undefined);
  }
}
