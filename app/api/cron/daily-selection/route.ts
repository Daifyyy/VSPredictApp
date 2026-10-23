import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runDailySelection } from "@/lib/data/dailySelectionPipeline";
import { publishDailySelectionTelegram } from "@/lib/dailySelectionTelegram";
import { withCronRun } from "@/lib/operations";

export const maxDuration=60;
export async function GET(request:Request){
  const denied=await requireCronAuth(request);if(denied)return denied;
  const params=new URL(request.url).searchParams,dryRun=params.get("dryRun")==="1",settle=params.get("settle")==="1";
  try{
    const run=async()=>{
      const now=new Date();
      // Separate optional AI batch; never feeds Daily Selection or VALUE/ELO.
      let ai: unknown = {status:'DRY_RUN'};
      if (!dryRun) {
        const { resourceBudgetGuard } = await import('@/lib/resourceBudgetGuard');
        if (!await resourceBudgetGuard(settle ? 'daily-selection-settle' : 'daily-selection')) {
          const { safeRunAIResearch } = await import('@/lib/data/aiResearchStore');
          ai = await safeRunAIResearch(now, settle);
        } else ai = {status:'RESOURCE_LIMITED'};
      }
      const selection=await runDailySelection(now,{dryRun,settle:!dryRun&&settle});
      const results=!dryRun?await publishDailySelectionTelegram(now,true):null;
      const distribution=settle?null:await publishDailySelectionTelegram(now,false,dryRun);
      return {selection,distribution,results,ai,candidates:0,processed:0,errors:selection.status==="FAILED"?1:0};
    };
    const result=dryRun?await run():await withCronRun("daily-selection",run);
    return NextResponse.json(result,{status:result.errors?502:200,headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"DAILY_SELECTION_FAILED"},{status:502});}
}
