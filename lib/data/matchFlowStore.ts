import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { evaluateMatchFlow, MATCH_FLOW_EVALUATION_VERSION, type FlowStats, type MatchFlowEvaluation } from "@/lib/picks/matchFlowEvaluation";
import type { PerformancePressureShadow } from "@/lib/picks/performancePressureShadow";
import { buildMatchInsight, type MatchInsight } from "@/lib/picks/matchInsight";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function pressureOf(input: Prisma.JsonValue | null): PerformancePressureShadow | null {
  const pressure = (input as { performancePressure?: PerformancePressureShadow } | null)?.performancePressure;
  return (pressure?.version === 3 || pressure?.version === 5) && pressure.expectedMatchShape ? pressure : null;
}
function stats(row: { xg:number|null;shots:number|null;shotsOnTarget:number|null;shotsInsideBox:number|null;corners:number|null;possession:number|null } | null): FlowStats {
  if (!row) return {};
  return Object.fromEntries(Object.entries({ XG:row.xg,SHOTS:row.shots,SHOTS_ON_TARGET:row.shotsOnTarget,SHOTS_INSIDE_BOX:row.shotsInsideBox,CORNERS:row.corners,POSSESSION:row.possession }).filter(([,v])=>v!=null)) as FlowStats;
}
export async function settleMatchFlowEvaluation(fixtureId:number,now=new Date()):Promise<"SKIPPED"|"PENDING"|"SETTLED">{
  const prediction=await prisma.fixturePrediction.findUnique({where:{fixtureId},select:{fixtureId:true,leagueId:true,kickoff:true,homeTeamId:true,awayTeamId:true,homeGoals:true,awayGoals:true,status:true,inputSnapshot:true}});
  const pressure=prediction?pressureOf(prediction.inputSnapshot):null;if(!prediction||!pressure)return"SKIPPED";
  if (!["FT", "AET", "PEN"].includes(prediction.status)) return "SKIPPED";
  const rows=await prisma.matchStatCache.findMany({where:{fixtureId},select:{teamId:true,xg:true,shots:true,shotsOnTarget:true,shotsInsideBox:true,corners:true,possession:true,redCards:true}}),homeRow=rows.find(row=>row.teamId===prediction.homeTeamId)??null,awayRow=rows.find(row=>row.teamId===prediction.awayTeamId)??null;
  const halftime=await prisma.liveMatchSnapshot.findFirst({where:{fixtureId,OR:[{status:"HT"},{minute:{gte:44,lte:50}}]},orderBy:{observedAt:"asc"},select:{minute:true,status:true,homeGoals:true,awayGoals:true,homeStats:true,awayStats:true,events:true}});
  const pending={fixtureId,leagueId:prediction.leagueId,kickoff:prediction.kickoff,pressureVersion:pressure.version,evaluationVersion:MATCH_FLOW_EVALUATION_VERSION,expectation:json({shape:pressure.expectedMatchShape,dependencyRisk:pressure.dependencyRisk}),halftime:halftime?json(halftime):Prisma.JsonNull};
  if(!homeRow||!awayRow||prediction.homeGoals==null||prediction.awayGoals==null){await prisma.matchFlowEvaluationSnapshot.upsert({where:{fixtureId_pressureVersion_evaluationVersion:{fixtureId,pressureVersion:pressure.version,evaluationVersion:MATCH_FLOW_EVALUATION_VERSION}},create:pending,update:{halftime:pending.halftime}});return"PENDING"}
  const redCards=(homeRow.redCards??0)+(awayRow.redCards??0),evaluation=evaluateMatchFlow({pressure,minute:90,status:prediction.status,home:stats(homeRow),away:stats(awayRow),goals:{home:prediction.homeGoals,away:prediction.awayGoals},redCards,final:true});
  const actual={home:stats(homeRow),away:stats(awayRow),goals:{home:prediction.homeGoals,away:prediction.awayGoals},redCards};
  await prisma.matchFlowEvaluationSnapshot.upsert({where:{fixtureId_pressureVersion_evaluationVersion:{fixtureId,pressureVersion:pressure.version,evaluationVersion:MATCH_FLOW_EVALUATION_VERSION}},create:{...pending,status:"SETTLED",verdict:evaluation.verdict,diagnosisCode:evaluation.diagnosis.code,coverage:evaluation.coverage,structurallyChanged:evaluation.structurallyChanged,actual:json(actual),evaluation:json(evaluation),evaluatedAt:now},update:{status:"SETTLED",verdict:evaluation.verdict,diagnosisCode:evaluation.diagnosis.code,coverage:evaluation.coverage,structurallyChanged:evaluation.structurallyChanged,halftime:pending.halftime,actual:json(actual),evaluation:json(evaluation),evaluatedAt:now}});
  return"SETTLED";
}

export async function liveMatchFlowEvaluation(fixtureId:number,input:{minute:number;status:string;home:FlowStats;away:FlowStats;goals:{home:number;away:number}|null;redCards:number;interrupted?:boolean}):Promise<MatchFlowEvaluation|null>{
  const row=await prisma.fixturePrediction.findUnique({where:{fixtureId},select:{inputSnapshot:true}}),pressure=row?pressureOf(row.inputSnapshot):null;
  return pressure?evaluateMatchFlow({pressure,...input}):null;
}

export async function liveMatchInsight(fixtureId:number,input:{minute:number;status:string;home:FlowStats;away:FlowStats;goals:{home:number;away:number}|null;redCards:number;interrupted?:boolean}):Promise<MatchInsight|null>{
  const row=await prisma.fixturePrediction.findUnique({where:{fixtureId},select:{inputSnapshot:true}}),pressure=row?pressureOf(row.inputSnapshot):null;
  if(!pressure)return null;
  const evaluation=evaluateMatchFlow({pressure,...input});
  return buildMatchInsight({pressure,evaluation,phase:evaluation.final?"FINAL":"LIVE",capturedAt:new Date().toISOString()});
}

export async function pendingMatchFlowFixtureIds(limit=20):Promise<number[]>{
  const rows=await prisma.matchFlowEvaluationSnapshot.findMany({where:{pressureVersion:{in:[3,5]},evaluationVersion:MATCH_FLOW_EVALUATION_VERSION,status:"PENDING"},orderBy:{kickoff:"asc"},take:limit,select:{fixtureId:true}});
  return rows.map((row)=>row.fixtureId);
}

/** Bounded repair of recent completed fixtures, including v5 rows skipped by older code.
 * Uses stored data only; no provider request is necessary. */
export async function repairRecentMatchFlowEvaluations(now = new Date()): Promise<number> {
  const predictions = await prisma.fixturePrediction.findMany({
    where: { status: { in: ["FT", "AET", "PEN"] }, kickoff: { gte: new Date(now.getTime() - 7 * 86400_000), lt: now } },
    orderBy: { kickoff: "desc" }, take: 100,
    select: { fixtureId: true, inputSnapshot: true },
  });
  const eligible = predictions.filter(row => pressureOf(row.inputSnapshot));
  const completed = await prisma.matchFlowEvaluationSnapshot.findMany({
    where: { fixtureId: { in: eligible.map(row => row.fixtureId) }, evaluationVersion: MATCH_FLOW_EVALUATION_VERSION, status: "SETTLED" },
    select: { fixtureId: true, pressureVersion: true },
  });
  const keys = new Set(completed.map(row => `${row.fixtureId}:${row.pressureVersion}`));
  const missing = eligible.filter(row => !keys.has(`${row.fixtureId}:${pressureOf(row.inputSnapshot)!.version}`)).slice(0, 10);
  let settled = 0;
  for (const row of missing) if (await settleMatchFlowEvaluation(row.fixtureId, now) === "SETTLED") settled++;
  return settled;
}
