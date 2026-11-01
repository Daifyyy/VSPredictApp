import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { MODEL_ONLY_POLICY } from './modelOnlyMode';
import { localDateKey } from './competitionGrouping';
import { MODEL_SOURCE_LABELS, modelSelectionLabel } from './picks/modelOnly';
import { telegramConfig, sendTelegramMessages, splitTelegramBlocks, pragueClock, shiftDateKey, isTelegramDateAllowed } from './telegram';
import { upsertIncident } from './operations';
import { isDateKey } from './picks/strategyHub';
import { createHash } from 'node:crypto';

type DisplayRow={id:string;fixtureId:number;source:string;homeName:string;awayName:string;market:string;side:string;line:number|null;probability:number;kickoff:Date;outcome:string};
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const aliases:Record<string,string>={'1x2':'MAIN_1X2',over25:'ORIGINAL_OVER',elo:'ELO_1X2',value:'MODEL_COMBINATION',kombinace:'MODEL_COMBINATION',ai:'AI_OVER',tymove_goly:'TEAM_GOALS'};
export function formatModelMessages(date:string,rows:DisplayRow[],results=false){
 return splitTelegramBlocks([`<b>${results?'Výsledky modelových výběrů':'Modelové predikce'} · ${date}</b>\nBez kurzů · úspěšnost není ziskovost.`,
  ...rows.map(r=>`${r.outcome==='WON'?'✅':r.outcome==='LOST'?'❌':r.outcome==='VOID'?'↩️':'⏳'} <b>${esc(r.homeName)} – ${esc(r.awayName)}</b>\n${esc(modelSelectionLabel(r))} · model ${Math.round(r.probability*100)} %\n${esc(MODEL_SOURCE_LABELS[r.source]??r.source)} · ${new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'}).format(r.kickoff)}`),
  ...(!rows.length?['Žádné zachycené výběry pro tento přehled. Neznamená to nulovou historickou bilanci.']:[])]);
}
async function rowsFor(date:string,source?:string,offset=0,results=false,now=new Date()){
 const rows=await prisma.modelOnlyForecast.findMany({where:{dateKey:date,policyVersion:MODEL_ONLY_POLICY,qualified:true,...(source==='TEAM_GOALS'?{source:{startsWith:'TEAM_'}}:source?{source}:{}),...(!results?{outcome:'PENDING',kickoff:{gt:now}}:{})},orderBy:[{probability:'desc'},{kickoff:'asc'},{id:'asc'}],skip:offset,take:5});
 if(results||!rows.length)return rows;
 const current=await prisma.fixturePrediction.findMany({where:{fixtureId:{in:rows.map(r=>r.fixtureId)}},select:{fixtureId:true,homeTeamId:true,awayTeamId:true,status:true,kickoff:true,available:true}});
 return rows.filter(r=>current.some(f=>f.fixtureId===r.fixtureId&&f.available&&f.status==='NS'&&+f.kickoff===+r.kickoff&&f.homeTeamId===r.homeTeamId&&f.awayTeamId===r.awayTeamId));
}
export async function handleModelCommand(userId:string,text:string,now=new Date()){
 if(!telegramConfig().allowedUsers.has(userId))return [];
 const [raw,...args]=text.trim().split(/\s+/),command=raw.toLowerCase().split('@')[0],today=localDateKey(now);
 if(command==='/help')return ['/tipy [1x2|over25|elo|kombinace|ai|tymove_goly]\n/dalsi [strategie]\n/vyber [YYYY-MM-DD]\n/vysledky [strategie] [YYYY-MM-DD]\n/datum YYYY-MM-DD [strategie]\n/stav\nVALUE pokračuje jako modelová kombinace, nikoli cenová strategie.'];
 if(command==='/stav')return ['Režim modelových predikcí. Kurzy, closing, CLV a Web Push jsou vypnuté. Historická sázková bilance je v archivu.'];
 const date=args.find(a=>isDateKey(a))??(command==='/vysledky'?shiftDateKey(today,-1):today);
 if(!isTelegramDateAllowed(date,today))return ['Neplatné nebo nepovolené datum.'];
 const requested=args.find(a=>!/^\d{4}-\d{2}-\d{2}$/.test(a)),source=requested?aliases[requested.toLowerCase()]:undefined;
 if(requested&&!source)return ['Neznámý model. Použij /help.'];
 if(command==='/vyber'){
  const day=await prisma.modelOnlyDay.findUnique({where:{key:`${MODEL_ONLY_POLICY}:${date}`}});
  const rows=day?await prisma.modelOnlyForecast.findMany({where:{id:{in:day.forecastIds}}}):[];
  return formatModelMessages(date,day?.forecastIds.flatMap(id=>rows.filter(r=>r.id===id))??[],date<today);
 }
 if(!['/tipy','/dalsi','/vysledky','/datum','/tiket'].includes(command))return ['Neznámý příkaz. Použij /help.'];
 const key=`MODEL:${MODEL_ONLY_POLICY}:${source??'ALL'}`;
 const cursor=command==='/dalsi'?await prisma.telegramCommandCursor.findUnique({where:{userId_dateKey_strategy:{userId,dateKey:date,strategy:key}}}):null;
 const offset=command==='/dalsi'?cursor?.offset??5:0;
 const rows=await rowsFor(date,source,offset,command==='/vysledky'||date<today,now);
 if(command==='/tipy'||command==='/dalsi')await prisma.telegramCommandCursor.upsert({where:{userId_dateKey_strategy:{userId,dateKey:date,strategy:key}},create:{userId,dateKey:date,strategy:key,offset:offset+rows.length},update:{offset:offset+rows.length}});
 return formatModelMessages(date,rows,command==='/vysledky'||date<today);
}

export async function publishModelMorning(now=new Date(),options:{dryRun?:boolean;force?:boolean}={}){
 const clock=pragueClock(now),config=telegramConfig();
 if(!options.force&&(clock.hour<9||clock.hour>10))return {skipped:'OUTSIDE_PRAGUE_MORNING_WINDOW'};
 const {resourceBudgetGuard}=await import('./resourceBudgetGuard');if(await resourceBudgetGuard('telegram-digest'))return {status:'RESOURCE_LIMITED'};
 const yesterday=shiftDateKey(clock.date,-1);
 const prior=await prisma.telegramPublication.findUnique({where:{dateKey_channelId_kind:{dateKey:yesterday,channelId:config.channelId,kind:`MODEL_TIPS_${MODEL_ONLY_POLICY}`}}}) ?? await prisma.telegramPublication.findUnique({where:{dateKey_channelId_kind:{dateKey:yesterday,channelId:config.channelId,kind:'MODEL_TIPS_2002'}}}) ?? await prisma.telegramPublication.findUnique({where:{dateKey_channelId_kind:{dateKey:yesterday,channelId:config.channelId,kind:'MODEL_TIPS_2001'}}});
 const priorIds=(prior?.status==='SENT'?(prior.payload as {ids?:string[]})?.ids:[])??[];
 const todayRows=await rowsFor(clock.date,undefined,0,false,now);
 const resultRows=priorIds.length?await prisma.modelOnlyForecast.findMany({where:{id:{in:priorIds}}}):[];
 const entries=[{kind:`MODEL_TIPS_${MODEL_ONLY_POLICY}`,date:clock.date,rows:todayRows.slice(0,3),results:false},{kind:`MODEL_RESULTS_${MODEL_ONLY_POLICY}`,date:yesterday,rows:resultRows,results:true}];
 if(options.dryRun||!config.enabled)return {dryRun:true,messages:entries.flatMap(e=>formatModelMessages(e.date,e.rows,e.results))};
 if(!config.channelId||!config.token)throw Error('TELEGRAM_NOT_CONFIGURED');
 await prisma.telegramPublication.updateMany({where:{kind:{startsWith:'MODEL_'},status:'SENDING',updatedAt:{lt:new Date(+now-15*60_000)}},data:{status:'UNKNOWN',lastError:'Delivery uncertain; no automatic retry'}});
 const sent:string[]=[];
 for(const entry of entries){
  const messages=formatModelMessages(entry.date,entry.rows,entry.results);
  const payload={ids:entry.rows.map(r=>r.id),messages,policyVersion:MODEL_ONLY_POLICY};
  const record=await prisma.telegramPublication.upsert({where:{dateKey_channelId_kind:{dateKey:clock.date,channelId:config.channelId,kind:entry.kind}},create:{dateKey:clock.date,channelId:config.channelId,kind:entry.kind,policyVersions:{modelOnly:MODEL_ONLY_POLICY},payload:payload as Prisma.InputJsonValue,contentHash:createHash('sha256').update(messages.join('\n')).digest('hex')},update:{}});
  const claim=await prisma.telegramPublication.updateMany({where:{id:record.id,status:'PENDING'},data:{status:'SENDING',attempts:{increment:1}}});if(!claim.count)continue;
  try{
   const frozen=(record.payload as {messages:string[]}).messages;
   const ids=await sendTelegramMessages(config.channelId,frozen);
   await prisma.telegramPublication.update({where:{id:record.id},data:{status:'SENT',messageIds:ids,sentAt:now}});sent.push(entry.kind);
  }catch(error){
   await prisma.telegramPublication.update({where:{id:record.id},data:{status:'UNKNOWN',lastError:String(error)}});
   await upsertIncident({fingerprint:`model-telegram:${record.id}`,kind:'TELEGRAM_DELIVERY',severity:'CRITICAL',message:'Nejisté doručení modelového přehledu; bez automatického opakování.'});throw error;
  }
 }
 return {date:clock.date,sent};
}
