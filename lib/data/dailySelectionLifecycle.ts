import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { dailyBalance, settleDailyMarket } from "../picks/dailySelectionSettlement";
import { comparableMarketQuote, clvV2, type ComparableMarket, type ComparableSide } from "../picks/comparableMarketQuote";
import { parseBooks } from "../picks/books";
import type { DailyPublicationCandidate } from "./dailySelectionStore";

const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
export const dailyBalanceKey=(policy:number)=>`daily-selection:balance:${policy}`;

/** Batch reads only. A withdrawal never removes the publication or its later loss. */
export async function settleDailySelection(now=new Date()) {
  const items=await prisma.dailySelectionItem.findMany({where:{OR:[{outcome:"PENDING"},{outcome:"UNEVALUABLE"},{closingAudit:{equals:Prisma.DbNull},kickoff:{gte:new Date(now.getTime()-7*86400_000)}}]},orderBy:{kickoff:"desc"},take:500});
  const ids=[...new Set(items.map(i=>i.fixtureId))];
  const [fixtures,stats]=await Promise.all([
    prisma.fixturePrediction.findMany({where:{fixtureId:{in:ids}},select:{fixtureId:true,homeTeamId:true,awayTeamId:true,status:true,kickoff:true,homeGoals:true,awayGoals:true,oddsCloseAt:true,oddsCloseBooks:true,oddsCurrentAt:true,oddsCurrentBooks:true}}),
    prisma.matchStatCache.findMany({where:{fixtureId:{in:ids}},select:{fixtureId:true,teamId:true,corners:true,fouls:true,yellowCards:true,redCards:true}}),
  ]);
  const byFixture=new Map(fixtures.map(f=>[f.fixtureId,f]));
  const byTeam=new Map(stats.map(s=>[`${s.fixtureId}:${s.teamId}`,s]));
  let settled=0;
  for(const item of items){
    const f=byFixture.get(item.fixtureId);if(!f)continue;
    const s=item.snapshot as unknown as DailyPublicationCandidate;
    const identity=f.homeTeamId===s.homeTeamId&&f.awayTeamId===s.awayTeamId;
    const key=JSON.parse(item.marketKey) as [string,string,number|string|null,number?];
    const teamCount=(teamId:number)=>{const t=byTeam.get(`${item.fixtureId}:${teamId}`);return key[0]==="CORNERS"?t?.corners:key[0]==="FOULS"?t?.fouls:t?.yellowCards==null&&t?.redCards==null?null:(t?.yellowCards??0)+(t?.redCards??0);};
    const homeCount=teamCount(s.homeTeamId),awayCount=teamCount(s.awayTeamId);
    const actualCount=homeCount!=null&&awayCount!=null?homeCount+awayCount:null;
    const outcome=settleDailyMarket({marketKey:item.marketKey,status:f.status,home:f.homeGoals,away:f.awayGoals,actualCount,identityValid:identity});
    const changedKickoff=f.kickoff.getTime()!==item.kickoff.getTime();
    let audit:ReturnType<typeof clvV2>|null=null;
    let closing:ReturnType<typeof comparableMarketQuote>|null=null;
    if(identity&&!changedKickoff&&f.oddsCloseAt&&f.oddsCloseAt>=item.publishedAt&&key[0]!=="RESULT_TOTAL"){
      const market=(key[0].startsWith("TEAM_HOME")?"TEAM_HOME":key[0].startsWith("TEAM_AWAY")?"TEAM_AWAY":key[0]) as ComparableMarket;
      const line=typeof key[2]==="number"?key[2]:null;
      closing=comparableMarketQuote({books:parseBooks(f.oddsCloseBooks),market,side:key[1] as ComparableSide,line,sampledAt:f.oddsCloseAt});
      audit=clvV2({opening:{bookmakerId:s.quoteAudit?.bookmakerId??null,bookmaker:item.bookmaker,decimalOdds:item.decimalOdds,oppositeOdds:s.quoteAudit?.oppositeOdds??null,fairProbability:s.marketProbability,line,sampledAt:item.quotedAt,benchmarkQuality:s.quoteAudit?.benchmarkQuality??"UNAVAILABLE",panelSize:s.quoteAudit?.panelSize??0},closing,kickoff:item.kickoff});
    }
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily-selection-item:${item.id}`}))::text`;
      const current=await tx.dailySelectionItem.findUniqueOrThrow({where:{id:item.id}});
      const warning=!identity?"FIXTURE_IDENTITY_CHANGED":changedKickoff?"KICKOFF_CHANGED":["PST","ABD","SUSP"].includes(f.status)?`FIXTURE_${f.status}`:null;
      if(warning)await tx.dailySelectionEvent.upsert({where:{eventKey:`warning:${item.id}:${warning}`},create:{eventKey:`warning:${item.id}:${warning}`,dayId:item.dayId,itemId:item.id,kind:"WARNING",payload:{reason:warning,at:now.toISOString()}},update:{}});
      if((current.outcome==="PENDING"||current.outcome==="UNEVALUABLE")&&outcome!=="PENDING"&&outcome!==current.outcome){
        const profit=outcome==="WON"?item.decimalOdds-1:outcome==="LOST"?-1:outcome==="VOID"?0:null;
        await tx.dailySelectionItem.update({where:{id:item.id},data:{outcome,profit,settledAt:outcome==="UNEVALUABLE"?null:now}});
        await tx.dailySelectionEvent.create({data:{eventKey:`settlement:${item.id}:${outcome}`,dayId:item.dayId,itemId:item.id,kind:"SETTLEMENT",payload:{outcome,profit,at:now.toISOString()}}});settled++;
      }
      if(audit&&closing&&audit.priceClv!=null)await tx.dailySelectionItem.update({where:{id:item.id},data:{priceClv:audit.priceClv,closingAudit:json({methodVersion:2,...audit,closing})}});
    });
  }
  return {settled,checked:items.length};
}

/** Precompute balances after publication/settlement; never aggregate history in a page. */
export async function refreshDailySelectionBalances(now=new Date()) {
  const rows=await prisma.dailySelectionItem.findMany({select:{dayId:true,tier:true,outcome:true,profit:true,decimalOdds:true,snapshot:true,day:{select:{policyVersion:true}}}});
  const policies=[...new Set(rows.map(r=>r.day.policyVersion))];
  for(const policy of policies){
    const scoped=rows.filter(r=>r.day.policyVersion===policy);
    const byTier=Object.fromEntries(["DOCUMENTED_SOURCE","UNVERIFIED"].map(tier=>[tier,dailyBalance(scoped.filter(r=>r.tier===tier))]));
    const strategies=[...new Set(scoped.map(r=>(r.snapshot as unknown as DailyPublicationCandidate).strategy))];
    const payload=json({policyVersion:policy,asOf:now.toISOString(),total:dailyBalance(scoped),byTier,byStrategy:Object.fromEntries(strategies.map(strategy=>[strategy,dailyBalance(scoped.filter(r=>(r.snapshot as unknown as DailyPublicationCandidate).strategy===strategy))]))});
    const key=dailyBalanceKey(policy),expiresAt=new Date(now.getTime()+365*86400_000);
    await prisma.apiCache.upsert({where:{key},create:{key,payload,expiresAt},update:{payload,expiresAt}});
  }
}
