import { MODEL_ONLY_POLICY, MODEL_ONLY_POLICIES } from '@/lib/modelOnlyMode';
import { MODEL_SOURCE_LABELS } from '@/lib/picks/modelOnly';
import { getCurrentUser } from '@/lib/authUser';
import { getEntitlement } from '@/lib/entitlements';
import { localDateKey } from '@/lib/competitionGrouping';
import { isDateKey } from '@/lib/picks/strategyHub';
import { readModelOnly } from '@/lib/data/modelOnlyStore';
import { allowRequest,clientKey,tooMany } from '@/lib/rateLimit';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,date=params.get('date')??localDateKey(new Date()),page=Number(params.get('page')??0);
 const policy=Number(params.get('policy')??MODEL_ONLY_POLICY);
 if(!MODEL_ONLY_POLICIES.includes(policy))return Response.json({error:'INVALID_POLICY'},{status:400});
 const source=params.get('source')??undefined;
 if(source && source!=='TEAM_GOALS' && !(source in MODEL_SOURCE_LABELS))return Response.json({error:'INVALID_SOURCE'},{status:400});
 if(!isDateKey(date)||!Number.isInteger(page)||page<0||page>100||date>localDateKey(new Date(Date.now()+7*86400_000)))return Response.json({error:'INVALID_QUERY'},{status:400});
 if(!allowRequest(`model-only:${clientKey(request)}`,60,60_000))return tooMany();
 try{return Response.json(await readModelOnly(date,getEntitlement(await getCurrentUser()).pro,page,source,params.get('qualified')==='1',policy),{headers:{'Cache-Control':'private, no-store'}});}
 catch{return Response.json({error:'MODEL_DATA_UNAVAILABLE',stale:true,limitedReason:'MODEL_DATA_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
