import { PrismaClient } from "@prisma/client";
import { PRESSURE_V3_CALIBRATION, type PressureContext } from "../lib/picks/performancePressureShadow";

const prisma=new PrismaClient();
type Row={fixtureId:number;teamId:number;opponentId:number|null;context:string;date:Date;isHome:boolean;shots:number|null};
const contextOf=(value:string):PressureContext=>value==="euro"?"EURO_CUP":value==="national"?"NATIONAL":"LEAGUE";
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const mae=(values:number[])=>values.length?mean(values):null;

async function main(){
  const rows=await prisma.matchStatCache.findMany({where:{shots:{not:null},competitive:true},select:{fixtureId:true,teamId:true,opponentId:true,context:true,date:true,isHome:true,shots:true},orderBy:[{date:"asc"},{fixtureId:"asc"}]}) as Row[];
  const fixtures=new Map<string,Row[]>();for(const row of rows){const key=`${row.context}:${row.fixtureId}`;fixtures.set(key,[...(fixtures.get(key)??[]),row])}
  const history=new Map<string,number[]>(),reports=new Map<PressureContext,{v3:number[];baseline:number[];covered:number;total:number;max:number;leaks:number}>();
  for(const group of fixtures.values()){
    if(group.length!==2)continue;const context=contextOf(group[0].context),cal=PRESSURE_V3_CALIBRATION[context],report=reports.get(context)??{v3:[],baseline:[],covered:0,total:0,max:0,leaks:0};
    for(const row of group){const key=`${context}:${row.teamId}:${row.isHome?"H":"A"}`,prior=history.get(key)??[],sample=Math.min(20,prior.length),raw=sample?mean(prior.slice(-20)):cal.shots.p50,pred=(raw*sample+cal.shots.p50*10)/(sample+10),actual=row.shots!;if(sample>=5){const low=Math.max(cal.shots.p1,pred-Math.max(1,pred*cal.interval.shots)),high=Math.min(cal.shots.p99,pred+Math.max(1,pred*cal.interval.shots));report.v3.push(Math.abs(pred-actual));report.baseline.push(Math.abs(cal.shots.p50-actual));report.covered+=Number(actual>=low&&actual<=high);report.total++;report.max=Math.max(report.max,pred)}history.set(key,[...prior,actual]);}
    reports.set(context,report);
  }
  const output=Object.fromEntries([...reports].map(([context,r])=>[context,{n:r.total,maeV3:mae(r.v3),maeContextBaseline:mae(r.baseline),coverage80:r.total?r.covered/r.total:null,maxExpectedShots:r.max,pointInTimeLeaks:r.leaks}]));
  console.log(JSON.stringify({method:"rolling-origin",grain:"fixture-team",output},null,2));
  const failed=Object.values(output).some(r=>r.n>=200&&(r.maeV3==null||r.maeContextBaseline==null||r.maeV3>=r.maeContextBaseline||r.coverage80==null||r.coverage80<.75||r.coverage80>.85));
  if(failed)process.exitCode=1;
}
main().finally(()=>prisma.$disconnect());
