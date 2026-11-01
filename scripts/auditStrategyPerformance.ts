/** Explicit, bounded read-only audit. No provider calls or production writes. */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
const db = new PrismaClient();
async function main() {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
    if(process.argv.includes('--verify')) {
      const sql=`SELECT strategy,"policyVersion","modelVersion","contextVersion","countModelVersion","modelContext",count(*)::int AS n,count(*) FILTER (WHERE hit)::int AS hits,sum(CASE WHEN hit THEN "decimalOdds"-1 ELSE -1 END)::float8 AS profit FROM "AutonomousTipSnapshot" WHERE status='candidate' AND "qualifiedAt"<kickoff AND "decimalOdds">1 AND hit IS NOT NULL AND "settledAt" IS NOT NULL AND "settledAt"<='2026-10-13T18:44:40.905Z' AND "settlementStatus" NOT IN ('VOID','UNAVAILABLE') GROUP BY 1,2,3,4,5,6`;
      return {verification:await tx.$queryRawUnsafe(sql),queries:[sql]};
    }
    if(process.argv.includes('--supplement')) {
      const v5=await tx.$queryRaw`SELECT "fixtureId","leagueId",kickoff,status,"homeGoals","awayGoals", "inputSnapshot" #> '{performancePressure,marketProbabilities}' AS probabilities,"inputSnapshot" #> '{performancePressure,mainMarketProbabilities}' AS baseline,"inputSnapshot" #> '{performancePressure,currentOver25}' AS "currentOver25","inputSnapshot" #>> '{performancePressure,capturedAt}' AS captured,"inputSnapshot" #>> '{performancePressure,artifactVersion}' AS artifact,"inputSnapshot" #>> '{performancePressure,context}' AS context FROM "FixturePrediction" WHERE "inputSnapshot" #> '{performancePressure,version}'='5'::jsonb LIMIT 10001`;
      const checklist=await tx.$queryRaw`SELECT c."fixtureId",c."leagueId",c.kickoff,c.market,c.side,c.line,c.status,c."modelProbability",c."marketProbability",c."decimalOdds",c.bookmaker,c."modelContext",c."modelVersion",c."contextVersion",c."checklistVersion",c."candidateAt",f.status AS "fixtureStatus",f."homeGoals",f."awayGoals" FROM "ChecklistDecisionSnapshot" c LEFT JOIN "FixturePrediction" f USING ("fixtureId") WHERE c.status='candidate' LIMIT 10001`;
      const published=await tx.$queryRaw`SELECT "fixtureId","leagueId",kickoff,"modelVersion","contextVersion","modelContext","publicationPolicyVersion","published1x2Side","published1x2Prob","publishedAt",status,"homeGoals","awayGoals" FROM "FixturePrediction" WHERE "published1x2Side" IS NOT NULL LIMIT 10001`;
      return {v5,checklist,published};
    }
    const autonomous = await tx.autonomousTipSnapshot.findMany({where:{status:'candidate'},select:{id:true,fixtureId:true,leagueId:true,kickoff:true,strategy:true,policyVersion:true,modelVersion:true,contextVersion:true,countModelVersion:true,modelContext:true,market:true,side:true,line:true,decimalOdds:true,bookmaker:true,modelProbability:true,marketProbability:true,qualifiedAt:true,capturedAt:true,settlementStatus:true,hit:true,profit:true,settledAt:true,clvMethodVersion:true,priceClv:true,closingFreshness:true,closingBenchmarkQuality:true,closingBenchmarkProbability:true,closedAt:true,sameBookClv:true},take:20001});
    const inventory = await tx.autonomousTipSnapshot.groupBy({by:['strategy','policyVersion','status'],_count:true});
    const signals = await tx.$queryRaw`SELECT s.id,s."fixtureId",s."leagueId",s.kickoff,s.market,s.side,s.line,s."policyVersion",s."modelVersion",s."contextVersion",s."modelContext",s."countModelVersion",s."publishedTip",s."modelProbability",s."openMarketProbability",s."decimalOdds",s.bookmaker,s."openedAt",s."quotedAt",s."priceClv",s."clvMethodVersion",s."closingFreshness",s."closingBenchmarkQuality",s."closingBenchmarkProbability",s."sameBookClv",s."closedAt",f.status AS "fixtureStatus",f."homeGoals",f."awayGoals" FROM "MarketSignalSnapshot" s LEFT JOIN "FixturePrediction" f ON s."fixtureId"=f."fixtureId" ORDER BY s."openedAt" LIMIT 30001`;
    const tickets = await tx.intuitionTicket.findMany({select:{id:true,strategy:true,policyVersion:true,status:true,combinedOdds:true,priceKind:true,lockedAt:true,settledAt:true,hit:true,profit:true,legs:{select:{fixtureId:true,leagueId:true,kickoff:true,winner:true,totalSide:true,totalLine:true,priceKind:true,decimalOdds:true,modelProbability:true,modelPredictionVersion:true,decisionPolicyVersion:true,marketAnchorProbability:true,hit:true,settledAt:true,priceClv:true,clvMethodVersion:true,closingFreshness:true}}},take:10001});
    const quick = await tx.quickOverviewSelection.findMany({select:{id:true,fixtureId:true,leagueId:true,kickoff:true,category:true,policyVersion:true,modelVersion:true,contextVersion:true,modelContext:true,side:true,line:true,sourceMarket:true,modelProbability:true,marketProbability:true,decimalOdds:true,bookmaker:true,oddsAt:true,qualifiedAt:true,settlementStatus:true,hit:true,profit:true,settledAt:true},take:20001});
    const live = await tx.liveCandidateSnapshot.findMany({select:{id:true,fixtureId:true,leagueId:true,kickoff:true,market:true,side:true,line:true,policyVersion:true,modelVersion:true,modelProbability:true,marketProbability:true,decimalOdds:true,qualifiedAt:true,minute:true,settlementStatus:true,hit:true,profit:true,settledAt:true},take:10001});
    const daily = await tx.dailySelectionItem.findMany({select:{id:true,fixtureId:true,leagueId:true,kickoff:true,marketKey:true,cohortKey:true,tier:true,decimalOdds:true,quotedAt:true,publishedAt:true,status:true,outcome:true,profit:true,settledAt:true,priceClv:true,day:{select:{policyVersion:true,dateKey:true}}},take:10001});
    const definitions = await tx.modelStrategyDefinition.findMany({select:{strategy:true,policyVersion:true,modelVersion:true,modelContext:true,status:true,startedAt:true,endedAt:true}});
    const forecasts = await tx.$queryRaw`SELECT "modelVersion","contextVersion","modelContext",count(*)::int AS total,count(*) FILTER(WHERE "homeGoals" IS NOT NULL AND "awayGoals" IS NOT NULL AND status IN ('FT','AET','PEN'))::int AS finished,count(*) FILTER(WHERE "predictedAt"<kickoff AND "homeGoals" IS NOT NULL AND "awayGoals" IS NOT NULL AND status='FT')::int AS "preKickoffFinished",min(kickoff) AS first,max(kickoff) AS last FROM "FixturePrediction" GROUP BY 1,2,3`;
    const flow = await tx.$queryRaw`SELECT "pressureVersion","evaluationVersion",status,count(*)::int FROM "MatchFlowEvaluationSnapshot" GROUP BY 1,2,3`;
    return {autonomous,inventory,signals,tickets,quick,live,daily,definitions,forecasts,flow};
  }, {timeout:60000,maxWait:5000});
  const payload=JSON.stringify({asOf:new Date().toISOString(),...result});
  await mkdir('.runtime/strategy-audit',{recursive:true});
  await writeFile(`.runtime/strategy-audit/${process.argv.includes('--verify')?'verification':process.argv.includes('--supplement')?'supplement':'evidence'}.json`,payload);
  console.log(JSON.stringify({bytes:Buffer.byteLength(payload),counts:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.length]))}));
}
main().catch(e=>{console.error('AUDIT_FAILED',e.code??'',e.message?.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));process.exitCode=1;}).finally(()=>db.$disconnect());
