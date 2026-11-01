import { randomUUID } from 'node:crypto';
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { MODEL_ONLY_POLICY, MODEL_ONLY_POLICIES } from '../modelOnlyMode';
import { localDateKey } from '../competitionGrouping';
import { mainModelCandidates, modelCandidate, appendModelDaily, settleModelForecast, type ModelCandidate } from '../picks/modelOnly';
import { CLUB_ELO_MODEL_VERSION } from '../picks/clubElo';
import { AI_ARTIFACT_ID } from '../picks/aiProduction';
import { aiFlags } from '../picks/aiResearch';

const summaryKey=`model-only:summary:${MODEL_ONLY_POLICY}`;
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function readModelOnlyFixture(fixtureId:number,pro:boolean){
 if(!pro)return [];
 return prisma.modelOnlyForecast.findMany({where:{fixtureId,policyVersion:{in:MODEL_ONLY_POLICIES}},orderBy:[{capturedAt:'asc'},{id:'asc'}],take:30,
  select:{id:true,source:true,market:true,side:true,line:true,probability:true,qualified:true,reason:true,capturedAt:true,outcome:true,modelVersion:true,modelContext:true,policyVersion:true}});
}
const select={fixtureId:true,leagueId:true,homeTeamId:true,awayTeamId:true,homeName:true,awayName:true,kickoff:true,predictedAt:true,status:true,available:true,lowConfidence:true,readinessSample:true,modelVersion:true,contextVersion:true,modelContext:true,homeWin:true,draw:true,awayWin:true,over25:true,lambdaHome:true,lambdaAway:true} as const;

/** Existing cron only. Bounded scalar projections; never loads prices or input histories. */
export async function captureModelOnly(now=new Date()){
 const rows=await prisma.fixturePrediction.findMany({where:{status:'NS',available:true,kickoff:{gte:new Date(+now+30*60_000),lt:new Date(+now+72*3600_000)}},select,orderBy:[{kickoff:'asc'},{fixtureId:'asc'}],take:201});
 const fixtures=rows.slice(0,200),ids=fixtures.map(f=>f.fixtureId);
 const [elo,ai]=ids.length?await Promise.all([
  prisma.clubEloFixtureSnapshot.findMany({where:{fixtureId:{in:ids},modelVersion:CLUB_ELO_MODEL_VERSION,generatedAt:{lte:now}},select:{fixtureId:true,modelVersion:true,generatedAt:true,homeProbability:true,drawProbability:true,awayProbability:true,homeLongSample:true,awayLongSample:true,homeFastSample:true,awayFastSample:true}}),
  aiFlags().inference ? prisma.aIForecastSnapshot.findMany({where:{fixtureId:{in:ids},artifactId:AI_ARTIFACT_ID,capturedAt:{lte:now}},select:{fixtureId:true,modelVersion:true,artifactId:true,capturedAt:true,probability:true,coverage:true,homeSample:true,awaySample:true,homeTeamId:true,awayTeamId:true,kickoff:true}}) : Promise.resolve([]),
 ]):[[],[]];
 const byElo=new Map(elo.map(r=>[r.fixtureId,r])),byAI=new Map(ai.map(r=>[r.fixtureId,r]));
 const candidates:ModelCandidate[]=fixtures.flatMap(f=>{
  const built=mainModelCandidates(f,now),e=byElo.get(f.fixtureId),a=byAI.get(f.fixtureId);
  if(e){const c=modelCandidate(f,'ELO_1X2',[e.homeProbability,e.drawProbability,e.awayProbability],now,{modelVersion:e.modelVersion,capturedAt:e.generatedAt,sample:Math.min(e.homeLongSample,e.awayLongSample,e.homeFastSample,e.awayFastSample)});if(c)built.push(c);}
  if(a&&a.coverage>=0.75&&a.homeTeamId===f.homeTeamId&&a.awayTeamId===f.awayTeamId&&+a.kickoff===+f.kickoff){const c=modelCandidate(f,'AI_OVER',[1-a.probability,a.probability],now,{modelVersion:a.modelVersion,artifactId:a.artifactId,capturedAt:a.capturedAt,sample:Math.min(a.homeSample,a.awaySample)});if(c)built.push(c);}
  return built;
 });
 const result=candidates.length?await prisma.modelOnlyForecast.createMany({data:candidates.map(c=>({...c,probabilities:json(c.probabilities)})),skipDuplicates:true}):{count:0};
 return {captured:result.count,fixtures:fixtures.length,limitedReason:rows.length>200?'MODEL_BATCH_LIMIT':null};
}

export async function assembleModelDay(now=new Date()){
 const date=localDateKey(now),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',hourCycle:'h23'}).format(now));
 if(hour<9)return {status:'BEFORE_PUBLICATION_WINDOW'};
 const key=`${MODEL_ONLY_POLICY}:${date}`;
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`model-only-day:${key}`}))`;
  const existing=await tx.modelOnlyDay.findUnique({where:{key}});
  const [previous,candidates]=await Promise.all([
   existing?.forecastIds.length?tx.modelOnlyForecast.findMany({where:{id:{in:existing.forecastIds}}}):[],
   tx.modelOnlyForecast.findMany({where:{dateKey:date,policyVersion:MODEL_ONLY_POLICY,qualified:true,outcome:'PENDING',kickoff:{gte:new Date(+now+30*60_000)}},orderBy:[{probability:'desc'},{kickoff:'asc'},{id:'asc'}],take:500}),
  ]);
  // Do not publish stale/moved fixtures or changed team identities from an old snapshot.
  const current=await tx.fixturePrediction.findMany({where:{fixtureId:{in:[...new Set(candidates.map(c=>c.fixtureId))]}},select:{fixtureId:true,kickoff:true,status:true,homeTeamId:true,awayTeamId:true}});
  const byId=new Map(current.map(f=>[f.fixtureId,f]));
  const valid=candidates.filter(c=>{const f=byId.get(c.fixtureId);return f?.status==='NS'&&+f.kickoff===+c.kickoff&&f.homeTeamId===c.homeTeamId&&f.awayTeamId===c.awayTeamId;});
  const ordered=existing?existing.forecastIds.flatMap(id=>previous.filter(p=>p.id===id)):[];
  const selected=appendModelDaily(ordered,valid,now).map(c=>c.id);
  await tx.modelOnlyDay.upsert({where:{key},create:{key,dateKey:date,policyVersion:MODEL_ONLY_POLICY,forecastIds:selected,createdAt:now},update:{forecastIds:selected}});
  return {status:'COMPLETED',count:selected.length,added:selected.length-ordered.length};
 });
}

export async function settleModelOnly(now=new Date()){
 // Only rows whose definitive result differs; later corrections replace, never add a second result.
 const rows=await prisma.$queryRaw<Array<{id:string;market:string;side:string;line:number|null;probabilities:unknown;status:string;home:number|null;away:number|null}>>`
 SELECT s.id,s.market,s.side,s.line,s.probabilities,f.status,f."homeGoals" AS home,f."awayGoals" AS away
 FROM "ModelOnlyForecast" s JOIN "FixturePrediction" f ON f."fixtureId"=s."fixtureId"
 WHERE s."policyVersion" IN (${Prisma.join(MODEL_ONLY_POLICIES)}) AND s."homeTeamId"=f."homeTeamId" AND s."awayTeamId"=f."awayTeamId"
 AND f.status IN ('FT','CANC','ABD','AWD','WO') AND
 (s.outcome='PENDING' OR s."homeGoals" IS DISTINCT FROM f."homeGoals" OR s."awayGoals" IS DISTINCT FROM f."awayGoals"
 OR (f.status<>'FT' AND s.outcome<>'VOID') OR (f.status='FT' AND s.outcome='VOID'))
 ORDER BY s.kickoff,s.id LIMIT 500`;
 const updates=rows.flatMap(r=>{const result=settleModelForecast(r,r.status,r.home,r.away);return result?[{...r,...result}]:[];});
 if(updates.length)await prisma.$executeRaw`UPDATE "ModelOnlyForecast" s SET outcome=v.outcome,hit=v.hit,"actualClass"=v.actual,"baselineHit"=v.baseline,brier=v.brier,"logLoss"=v.loss,"homeGoals"=v.home,"awayGoals"=v.away,"settledAt"=${now}
 FROM (VALUES ${Prisma.join(updates.map(u=>Prisma.sql`(${u.id}::text,${u.outcome}::text,${u.hit}::boolean,${u.actualClass}::integer,${u.baselineHit}::boolean,${u.brier}::float8,${u.logLoss}::float8,${u.home}::integer,${u.away}::integer)`))}) AS v(id,outcome,hit,actual,baseline,brier,loss,home,away) WHERE s.id=v.id`;
 return {settled:updates.length,limitedReason:rows.length===500?'SETTLEMENT_BATCH_LIMIT':null};
}

/** Small aggregate only, refreshed by cron; HTTP reads never scan forecast history. */
export async function refreshModelOnlySummary(now=new Date(),policyVersion:number=MODEL_ONLY_POLICY){
 const groups=await prisma.$queryRaw<Array<Record<string,unknown>>>`
 SELECT source,"modelVersion","contextVersion","artifactId","modelContext",count(*)::int AS forecasts,
 count(*) FILTER (WHERE qualified)::int AS qualified,
 count(hit)::int AS evaluated,count(*) FILTER (WHERE hit)::int AS correct,
 count(*) FILTER (WHERE qualified AND hit IS NOT NULL)::int AS "selectedEvaluated",
 count(*) FILTER (WHERE qualified AND hit)::int AS "selectedCorrect",
 count(*) FILTER (WHERE outcome='PENDING')::int AS pending,count(*) FILTER (WHERE outcome='VOID')::int AS void,
 avg("baselineHit"::int)::float8 AS "baselineAccuracy",avg(brier)::float8 AS brier,avg("logLoss")::float8 AS "logLoss"
 FROM "ModelOnlyForecast" WHERE "policyVersion"=${policyVersion}
 GROUP BY source,"modelVersion","contextVersion","artifactId","modelContext"`;
 const bins=await prisma.$queryRaw<Array<Record<string,unknown>>>`
 SELECT source,"modelVersion","contextVersion","artifactId","modelContext",LEAST(9,floor(probability*10))::int AS bin,
 count(*)::int AS n,avg(probability)::float8 AS probability,avg(hit::int)::float8 AS accuracy
 FROM "ModelOnlyForecast" WHERE "policyVersion"=${policyVersion} AND hit IS NOT NULL
 GROUP BY source,"modelVersion","contextVersion","artifactId","modelContext",bin`;
 const daily=await prisma.$queryRaw<Array<{published:number;evaluated:number;correct:number;pending:number}>>`
 SELECT count(*)::int AS published,count(s.hit)::int AS evaluated,count(*) FILTER (WHERE s.hit)::int AS correct,
 count(*) FILTER (WHERE s.outcome='PENDING')::int AS pending
 FROM "ModelOnlyDay" d JOIN "ModelOnlyForecast" s ON s.id=ANY(d."forecastIds") WHERE d."policyVersion"=${policyVersion}`;
 const same=(a:Record<string,unknown>,b:Record<string,unknown>)=>['source','modelVersion','contextVersion','artifactId','modelContext'].every(k=>a[k]===b[k]);
 const payload=json({policyVersion,asOf:now.toISOString(),daily:daily[0]??null,groups:groups.map(g=>({...g,ece:Number(g.evaluated)?bins.filter(b=>same(g,b)).reduce((sum,b)=>sum+Number(b.n)*Math.abs(Number(b.probability)-Number(b.accuracy)),0)/Number(g.evaluated):null})),calibration:'Selected-label ECE, 10 bins; not class-wise proof of calibration'});
 const summaryKey=`model-only:summary:${policyVersion}`;
 const expiresAt=new Date(+now+90*86400_000);
 await prisma.apiCache.upsert({where:{key:summaryKey},create:{key:summaryKey,payload,expiresAt},update:{payload,expiresAt}});
}

export async function runModelOnly(now=new Date(),options:{settle?:boolean;dryRun?:boolean}={}){
 const {resourceBudgetGuard}=await import('../resourceBudgetGuard');
 if(await resourceBudgetGuard(options.settle?'daily-selection-settle':'daily-selection'))return {status:'RESOURCE_LIMITED'};
 if(options.dryRun)return {status:'DRY_RUN',policyVersion:MODEL_ONLY_POLICY};
 const leaseKey='model-only:run-lease:2001',owner=randomUUID(),expiresAt=new Date(+now+90_000);
 const acquired=await prisma.$executeRaw`INSERT INTO "ApiCache" ("key","payload","expiresAt","updatedAt") VALUES (${leaseKey},${JSON.stringify({owner})}::jsonb,${expiresAt},${now}) ON CONFLICT ("key") DO UPDATE SET "payload"=EXCLUDED."payload","expiresAt"=EXCLUDED."expiresAt","updatedAt"=EXCLUDED."updatedAt" WHERE "ApiCache"."expiresAt"<=${now}`;
 if(!acquired)return {status:'LEASE_HELD'};
 try {
 const settlement=await settleModelOnly(now);
 const capture=options.settle?null:await captureModelOnly(now);
 const selection=options.settle?null:await assembleModelDay(now);
 const prior=await prisma.apiCache.findUnique({where:{key:summaryKey},select:{updatedAt:true}});
 if(settlement.settled || capture?.captured || selection && 'added' in selection && selection.added || !prior || +now-+prior.updatedAt>24*3600_000) { await refreshModelOnlySummary(now); if(settlement.settled)for(const version of MODEL_ONLY_POLICIES.filter(v=>v!==MODEL_ONLY_POLICY))await refreshModelOnlySummary(now,version); }
 return {status:'COMPLETED',settlement,capture,selection};
 } finally { await prisma.apiCache.deleteMany({where:{key:leaseKey,payload:{path:['owner'],equals:owner}}}); }
}

export async function readModelOnly(date:string,pro:boolean,page=0,source?:string,qualifiedOnly=false,policyVersion:number=MODEL_ONLY_POLICY){
 const [day,summary]=await Promise.all([prisma.modelOnlyDay.findUnique({where:{key:`${policyVersion}:${date}`}}),prisma.apiCache.findUnique({where:{key:`model-only:summary:${policyVersion}`},select:{payload:true,updatedAt:true}})]);
 const asOf=summary?.updatedAt.toISOString()??null,stale=!asOf||Date.now()-Date.parse(asOf)>26*3600_000;
 const [daily,forecasts]=pro?await Promise.all([
  day?.forecastIds.length?prisma.modelOnlyForecast.findMany({where:{id:{in:day.forecastIds}}}):[],
  prisma.modelOnlyForecast.findMany({where:{dateKey:date,policyVersion,...(source==='TEAM_GOALS'?{source:{startsWith:'TEAM_'}}:source?{source}:{}),...(qualifiedOnly?{qualified:true}:{})},orderBy:[{kickoff:'asc'},{id:'asc'}],skip:page*30,take:31}),
 ]):[[],[]];
 const data=(v:unknown)=>JSON.parse(JSON.stringify(v));
 return {mode:'MODEL_ONLY',date,policyVersion,asOf,stale,limitedReason:stale?'MODEL_SUMMARY_MISSING_OR_STALE':null,locked:!pro,count:day?.forecastIds.length??0,
  status:day?'ASSEMBLED':'NOT_ASSEMBLED',daily:data(day?.forecastIds.flatMap(id=>daily.filter(r=>r.id===id))??[]),forecasts:data(forecasts.slice(0,30)),hasMore:forecasts.length>30,page,
  summary:data(summary?.payload??null)};
}
