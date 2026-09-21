import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dailySelectionConfig } from "./dailySelectionConfig";
import { readDailySelection, type DailyPublicationCandidate } from "./data/dailySelectionStore";
import { dailyBalance } from "./picks/dailySelectionSettlement";
import { upsertIncident } from "./operations";
import { pragueClock, shiftDateKey, telegramConfig } from "./telegram";

type ReadDay=Awaited<ReturnType<typeof readDailySelection>>;
type Day=Omit<ReadDay,"items"> & {items:Array<ReadDay["items"][number]>};
const esc=(s:string)=>s.slice(0,160).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
export function formatDailySelection(data:Day,results=false):string[] {
  return dailySelectionMessageParts(data,results).map(p=>p.text);
}
export function dailySelectionMessageParts(data:Day,results=false):Array<{text:string;itemIds:string[]}> {
  const blocks=[`🎯 <b>${results?"Výsledky Denního výběru":"Denní výběr"} · ${data.date}</b>\n<i>Neověřený selektor · samostatné sázky</i>`];
  const blockIds=new Map<number,string>();
  for(const tier of ["DOCUMENTED_SOURCE","UNVERIFIED"]){
    const items=data.items.filter(i=>i.tier===tier);
    blocks.push(`<b>${tier==="DOCUMENTED_SOURCE"?"Z doložených strategií":"Neověření kandidáti"}</b>${items.length?"":"\nŽádný publikovaný výběr."}`);
    for(const item of items){
      const s=item.snapshot as unknown as DailyPublicationCandidate;
      const icon=item.outcome==="WON"?"✅":item.outcome==="LOST"?"❌":item.outcome==="VOID"?"↩️":item.outcome==="UNEVALUABLE"?"⚠️":"⏳";
      blocks.push(`${icon} <b>${esc(s.homeName)} – ${esc(s.awayName)}</b>\n${esc(s.selection)} · <b>${item.decimalOdds.toFixed(2)}</b>\n${esc(s.strategy)} · ${new Intl.DateTimeFormat("cs-CZ",{timeZone:"Europe/Prague",hour:"2-digit",minute:"2-digit"}).format(new Date(item.kickoff))}${item.status!=="ACTIVE"?" · ⚠️ staženo":""}`);
      blockIds.set(blocks.length-1,item.id);
    }
    if(results){const b=dailyBalance(items);blocks.push(`Bilance: ${b.won} ✅ / ${b.lost} ❌ / ${b.pending} ⏳ / ${b.void} ↩️ · profit ${b.profit.toFixed(2)} j · ROI ${b.roi==null?"—":`${(b.roi*100).toFixed(1)} %`}`);}
  }
  // Every bounded block is complete HTML; never cut a tag/entity in half.
  const messages:Array<{text:string;itemIds:string[]}>=[];let current="",ids:string[]=[];
  for(const [index,block] of blocks.entries()){
    if(current.length+block.length+2>3900){messages.push({text:current,itemIds:ids});current="";ids=[];}
    current+=(current?"\n\n":"")+block;
    const id=blockIds.get(index);if(id)ids.push(id);
  }
  if(current)messages.push({text:current,itemIds:ids});return messages;
}

/** Immutable per-part outbox. UNKNOWN and stale SENDING are never blindly retried. */
export async function publishDailySelectionTelegram(now=new Date(),results=false,dryRun=false){
  const config=telegramConfig(),clock=pragueClock(now);
  if(!dailySelectionConfig().telegram||!config.enabled)return {status:"DISABLED"};
  if(clock.hour<9||results&&clock.hour>10)return {status:"OUTSIDE_WINDOW"};
  const date=results?shiftDateKey(clock.date,-1):clock.date;
  const day=await readDailySelection(date,true);
  if(day.status==="NOT_ASSEMBLED")return {status:"NOT_ASSEMBLED"};
  if(dryRun)return {status:"DRY_RUN",messages:formatDailySelection(day,results)};
  if(!config.token||!config.channelId)throw new Error("Telegram configuration missing");
  const channelId=config.channelId;
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily-telegram:${date}:${channelId}`}))::text`;
    if(results&&await tx.telegramPublication.findFirst({where:{dateKey:date,channelId,kind:{startsWith:"DAILY_RESULTS:"}},select:{id:true}}))return;
    const prior=await tx.telegramPublication.findMany({where:{dateKey:date,channelId,kind:{startsWith:"DAILY_SELECTION:"}}});
    const delivered=new Set(prior.filter(p=>!results||p.status==="SENT").flatMap(p=>(p.payload as unknown as {itemIds:string[]}).itemIds??[]));
    const items=results?day.items.filter(i=>delivered.has(i.id)):day.items.filter(i=>!delivered.has(i.id));
    if(!results&&!items.length&&prior.length)return;
    if(results&&!prior.some(p=>p.status==="SENT"))return;
    const revision=results?"RESULTS":String(Math.max(0,...items.map(i=>i.rank)));
    const messages=dailySelectionMessageParts({...day,items},results);
    for(const [part,{text,itemIds}] of messages.entries()){
      const kind=`DAILY_${results?"RESULTS":"SELECTION"}:${revision}:${part}`;
      const payload=JSON.parse(JSON.stringify({itemIds,date,policyVersion:day.policyVersion,items:items.filter(i=>itemIds.includes(i.id)),text})) as Prisma.InputJsonValue;
      await tx.telegramPublication.upsert({where:{dateKey_channelId_kind:{dateKey:date,channelId,kind}},create:{dateKey:date,channelId,kind,policyVersions:{DAILY_SELECTION:day.policyVersion},payload,contentHash:createHash("sha256").update(text).digest("hex")},update:{}});
    }
  });
  const stale=await prisma.telegramPublication.findMany({where:{channelId,kind:{startsWith:"DAILY_"},status:"SENDING",updatedAt:{lt:new Date(now.getTime()-15*60_000)}},select:{id:true}});
  if(stale.length){
    await prisma.telegramPublication.updateMany({where:{id:{in:stale.map(s=>s.id)},status:"SENDING"},data:{status:"UNKNOWN",lastError:"Interrupted delivery; check channel before any manual retry"}});
    await upsertIncident({fingerprint:"daily-selection:telegram-unknown",kind:"TELEGRAM_DELIVERY",severity:"CRITICAL",message:"Denní výběr: stav doručení není známý, zkontrolujte kanál.",details:{publicationIds:stale.map(s=>s.id)}});
  }
  const pending=await prisma.telegramPublication.findMany({where:{dateKey:date,channelId,kind:{startsWith:results?"DAILY_RESULTS:":"DAILY_SELECTION:"},status:"PENDING"},orderBy:{createdAt:"asc"}});
  let sent=0;
  for(const row of pending){
    const claimed=await prisma.telegramPublication.updateMany({where:{id:row.id,status:"PENDING"},data:{status:"SENDING",attempts:{increment:1}}});if(!claimed.count)continue;
    try{
      const response=await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(8000),body:JSON.stringify({chat_id:channelId,text:(row.payload as {text:string}).text,parse_mode:"HTML",disable_web_page_preview:true})});
      const body=await response.json() as {ok?:boolean;result?:{message_id:number}};
      if(!response.ok||!body.ok||!body.result?.message_id)throw new Error(`Telegram response ${response.status}`);
      await prisma.telegramPublication.update({where:{id:row.id},data:{status:"SENT",sentAt:now,messageIds:[body.result.message_id]}});sent++;
    }catch{
      await prisma.telegramPublication.update({where:{id:row.id},data:{status:"UNKNOWN",lastError:"Delivery not confirmed; no automatic retry"}});
      await upsertIncident({fingerprint:`daily-selection:telegram:${row.id}`,kind:"TELEGRAM_DELIVERY",severity:"CRITICAL",message:"Doručení Denního výběru se nepodařilo potvrdit. Automatické opakování zastaveno.",details:{publicationId:row.id}});
    }
  }
  return {status:"PROCESSED",sent};
}
