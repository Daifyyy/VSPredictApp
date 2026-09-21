import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { buildDailyEvidence, dailyEvidenceCohortKey } from "../picks/dailySelectionEvidence";
import { dailyEvidenceCacheKey } from "./dailySelectionSources";
import { STRATEGY_CATALOG, type ModelLabLedgerRow } from "../picks/modelLab";
import { TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION, teamGoalOpportunityDecision } from "../picks/marketSignals";
import { PRESSURE_FLOW_V5_POLICY_VERSION } from "../picks/pressureFlowV5";

/** Explicit offline/settlement operation. No page or per-fixture invocation. */
export async function refreshDailyAutonomousEvidence(cutoff=new Date(), persist=false) {
  const [rows,signals]=await Promise.all([
    prisma.autonomousTipSnapshot.findMany({where:{status:"candidate",qualifiedAt:{lt:cutoff},settledAt:{lt:cutoff},hit:{not:null}}}),
    prisma.marketSignalSnapshot.findMany({where:{openedAt:{lt:cutoff},kickoff:{lt:cutoff},OR:[{policyVersion:TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION,market:{startsWith:"TEAM_"}},{policyVersion:PRESSURE_FLOW_V5_POLICY_VERSION}]}}),
  ]);
  const fixtures=await prisma.fixturePrediction.findMany({where:{fixtureId:{in:[...new Set([...rows,...signals].map(r=>r.fixtureId))]}},select:{fixtureId:true,homeGoals:true,awayGoals:true,homeTeamId:true,awayTeamId:true,status:true,settledAt:true,inputSnapshot:true,modelVersion:true,modelContext:true,contextVersion:true}});
  const byFixture=new Map(fixtures.map(f=>[f.fixtureId,f]));
  const rejected:Array<{sourceId:string;fixtureId:number;reason:string}>=[];
  const ledger:Array<ModelLabLedgerRow & {settledAt:Date|null;contextVersion:number;countModelVersion:number|null}>=rows.flatMap(r=>{
    const f=byFixture.get(r.fixtureId);
    const reason=!f?"MISSING_FIXTURE":!["FT","AET","PEN"].includes(f.status)?"NONFINAL_FIXTURE":f.homeTeamId!==r.homeTeamId||f.awayTeamId!==r.awayTeamId?"FIXTURE_IDENTITY_MISMATCH":null;
    if(reason||!f) {rejected.push({sourceId:r.id,fixtureId:r.fixtureId,reason:reason!});return [];}
    return [{...r,storedHit:r.hit,homeGoals:f.homeGoals,awayGoals:f.awayGoals,
      // Historical taken odds may differ from the audit panel's execution quote.
      // Recompute economically comparable CLV rather than copying another price.
      priceClv:r.decimalOdds!=null&&r.closingBenchmarkProbability!=null?r.decimalOdds*r.closingBenchmarkProbability-1:null,
      sameBookClv:r.bookmaker!=null&&r.bookmaker===r.openingBookmaker&&r.sameBookClv===true}];
  });
  const teamWinners=new Map<number,{id:string;score:number}>();
  for(const r of signals.filter(r=>r.policyVersion===TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION)){
    const d=teamGoalOpportunityDecision({fixtureId:r.fixtureId,market:r.market,line:r.line,modelProbability:r.modelProbability,marketProbability:r.openMarketProbability,decimalOdds:r.decimalOdds});
    if(d.eligible&&(!teamWinners.has(r.fixtureId)||d.score>teamWinners.get(r.fixtureId)!.score))teamWinners.set(r.fixtureId,{id:r.id,score:d.score});
  }
  for(const r of signals){
    const f=byFixture.get(r.fixtureId),v5=r.policyVersion===PRESSURE_FLOW_V5_POLICY_VERSION;
    if(!v5&&teamWinners.get(r.fixtureId)?.id!==r.id)continue;
    if(!f||!["FT","AET","PEN"].includes(f.status)||!f.settledAt||f.settledAt>=cutoff)continue;
    const snap=f.inputSnapshot as {capturedAt?:string;competition?:{fixtureId:number;homeTeamId:number;awayTeamId:number;kickoff:string}}|null;
    if(!snap?.competition||snap.competition.fixtureId!==r.fixtureId||snap.competition.homeTeamId!==f.homeTeamId||snap.competition.awayTeamId!==f.awayTeamId||Date.parse(snap.competition.kickoff)!==r.kickoff.getTime()||!snap.capturedAt||!(Date.parse(snap.capturedAt)<r.kickoff.getTime())||r.modelContext!==f.modelContext||r.contextVersion!==f.contextVersion||!v5&&r.modelVersion!==f.modelVersion){rejected.push({sourceId:r.id,fixtureId:r.fixtureId,reason:"MISSING_FROZEN_SIGNAL_IDENTITY"});continue;}
    const decision=v5?null:teamGoalOpportunityDecision({fixtureId:r.fixtureId,market:r.market,line:r.line,modelProbability:r.modelProbability,marketProbability:r.openMarketProbability,decimalOdds:r.decimalOdds});
    ledger.push({...r,strategy:v5?"PRESSURE_FLOW_V5":"TEAM_GOALS",modelProbability:decision?.decisionProbability??r.modelProbability,marketProbability:r.openMarketProbability,closingMarketProbability:r.closeMarketProbability,qualifiedAt:r.openedAt,stake:1,homeGoals:f.homeGoals,awayGoals:f.awayGoals,settledAt:f.settledAt,priceClv:r.decimalOdds!=null&&r.closingBenchmarkProbability!=null?r.decimalOdds*r.closingBenchmarkProbability-1:null,sameBookClv:r.bookmaker!=null&&r.bookmaker===r.openingBookmaker&&r.sameBookClv===true});
  }
  const groups=new Map<string,typeof ledger>();
  for(const row of ledger){const key=dailyEvidenceCohortKey(row);groups.set(key,[...(groups.get(key)??[]),row]);}
  const definitions=await prisma.modelStrategyDefinition.findMany({select:{strategy:true,modelVersion:true,policyVersion:true,modelContext:true,decisionCriteria:true}});
  const summaries=[...groups].map(([key,group])=>{
    const catalog=STRATEGY_CATALOG.find(c=>c.strategy===group[0].strategy&&c.policyVersion===group[0].policyVersion);
    // Approval must explicitly name this submarket AND all versions; aggregate status is insufficient.
    const definition=definitions.find(d=>d.strategy===group[0].strategy&&d.modelVersion===group[0].modelVersion&&d.policyVersion===group[0].policyVersion&&d.modelContext===group[0].modelContext);
    const approvals=(definition?.decisionCriteria as {dailySelectionApprovals?:Array<{cohortKey:string;at:string;approvedBy:string}>}|null)?.dailySelectionApprovals;
    const saved=Array.isArray(approvals)?approvals.find(a=>a.cohortKey===key&&a.approvedBy&&Number.isFinite(Date.parse(a.at))):undefined;
    return buildDailyEvidence(group,key,cutoff,saved?{cohortKey:key,at:new Date(saved.at)}:null,!catalog||catalog.status==="RESEARCH"||catalog.status==="RETIRED");
  });
  if(persist) for(const summary of summaries) {
    const payload=JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonValue;
    const expiresAt=new Date(cutoff.getTime()+36*3600_000);
    await prisma.apiCache.upsert({where:{key:dailyEvidenceCacheKey(summary.cohortKey)},create:{key:dailyEvidenceCacheKey(summary.cohortKey),payload,expiresAt},update:{payload,expiresAt}});
  }
  return {summaries,rejected};
}
