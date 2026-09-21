import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { pragueDateBounds } from "../recentWindow";
import { dailyEvidenceCohortKey } from "../picks/dailySelectionEvidence";
import { dailyAutonomousCandidate } from "../picks/dailyAutonomousSource";
import { STRATEGY_CATALOG } from "../picks/modelLab";
import { PUBLIC_CLUB_LEAGUE_IDS } from "./catalog";
import type { DailyEvidence } from "../picks/dailySelection";

export const dailyEvidenceCacheKey=(cohort:string)=>`daily-evidence:v1:${createHash("sha256").update(cohort).digest("hex")}`;

/** Bounded day-only read. Never loads historical ledgers or calls the provider. */
export async function loadDailyAutonomousSources(date:string, now=new Date()) {
  const bounds=pragueDateBounds(date);
  const [rows,definitions,incidents]=await Promise.all([
    prisma.autonomousTipSnapshot.findMany({where:{status:"candidate",kickoff:{gte:bounds.start,lt:bounds.end},leagueId:{in:[...PUBLIC_CLUB_LEAGUE_IDS]}}}),
    prisma.modelStrategyDefinition.findMany({select:{strategy:true,policyVersion:true,modelVersion:true,modelContext:true,status:true}}),
    prisma.dataIncident.findMany({where:{status:"OPEN",severity:"CRITICAL"},select:{kind:true,details:true}}),
  ]);
  const cohortKeys=[...new Set(rows.map(dailyEvidenceCohortKey))];
  const [fixtures,cached]=await Promise.all([
    prisma.fixturePrediction.findMany({where:{fixtureId:{in:[...new Set(rows.map(r=>r.fixtureId))]}},select:{fixtureId:true,leagueId:true,homeTeamId:true,awayTeamId:true,homeName:true,awayName:true,kickoff:true,status:true,available:true,modelVersion:true,modelContext:true,contextVersion:true,countModelVersion:true,foulModelVersion:true,oddsCurrentAt:true,oddsCurrentBooks:true,lowConfidence:true,readinessSample:true,homeWin:true,draw:true,awayWin:true}}),
    prisma.apiCache.findMany({where:{key:{in:cohortKeys.map(dailyEvidenceCacheKey)},expiresAt:{gt:now}}}),
  ]);
  const byFixture=new Map(fixtures.map(f=>[f.fixtureId,f]));
  const evidence=new Map(cached.map(c=>[c.key,c.payload as unknown as DailyEvidence]));
  const rejected:Array<{id:string;reason:string}>=[];
  const candidates=rows.flatMap(row=>{
    const fixture=byFixture.get(row.fixtureId);
    if(!fixture){rejected.push({id:row.id,reason:"MISSING_FIXTURE"});return [];}
    const definition=definitions.find(d=>d.strategy===row.strategy&&d.policyVersion===row.policyVersion&&d.modelVersion===row.modelVersion&&d.modelContext===row.modelContext);
    const catalog=STRATEGY_CATALOG.find(d=>d.strategy===row.strategy&&d.policyVersion===row.policyVersion);
    const sourceBlocked=!catalog||catalog.status==="RETIRED"||catalog.status==="REJECTED"||!!definition&&["RETIRED","REJECTED","PAUSED"].includes(definition.status);
    const incidentBlocked=incidents.some(i=>{
      const detail=i.details as {fixtureId?:number;fixtureIds?:number[];leagueId?:number;strategy?:string;scope?:string}|null;
      return detail?.fixtureId===row.fixtureId||detail?.fixtureIds?.includes(row.fixtureId)||detail?.leagueId===row.leagueId||detail?.strategy===row.strategy||detail?.scope==="GLOBAL";
    });
    const result=dailyAutonomousCandidate(row,fixture,evidence.get(dailyEvidenceCacheKey(dailyEvidenceCohortKey(row)))??null,now,sourceBlocked||incidentBlocked);
    if(!result.candidate){rejected.push({id:row.id,reason:result.reason!});return [];}
    return [result.candidate];
  });
  return {candidates,rejected,sourceCoverage:{autonomous:true,teamGoals:false,pressureFlow:false,valueElo:false}};
}
