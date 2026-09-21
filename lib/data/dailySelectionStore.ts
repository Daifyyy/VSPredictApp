import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dailySelectionConfig } from "@/lib/dailySelectionConfig";
import { localDateKey } from "@/lib/competitionGrouping";
import { DAILY_SELECTION_POLICY_VERSION, selectDailyCandidates, type DailyCandidate } from "@/lib/picks/dailySelection";
import type { ComparableMarketQuote } from "../picks/comparableMarketQuote";
import { dailyBalanceKey } from "./dailySelectionLifecycle";

export interface DailyPublicationCandidate extends DailyCandidate {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  selection: string;
  reason: string;
  risk: string;
  strategy: string;
  quoteAudit?: Omit<ComparableMarketQuote,"sampledAt">;
}
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

/** Only called with candidates produced by source adapters, never from an HTTP body. */
export async function appendDailySelection(candidates: DailyPublicationCandidate[], now = new Date(), dryRun = false, sourceRejections:Array<{id:string;reason:string}>=[]) {
  if (!dailySelectionConfig().collect && !dryRun) return { status: "DISABLED" as const };
  const dateKey = localDateKey(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Prague",hour:"2-digit",hourCycle:"h23"}).format(now));
  if (hour < 9) return {status:"BEFORE_PUBLICATION" as const};
  const currentCandidates = candidates.filter(c => localDateKey(new Date(c.kickoff)) === dateKey);
  if (dryRun) {
    const day = await prisma.dailySelectionDay.findUnique({where:{dateKey},include:{items:true}});
    return {status:"DRY_RUN" as const,...selectDailyCandidates(currentCandidates,day?.items??[],now)};
  }
  return prisma.$transaction(async tx => {
    // Transaction-scoped lock before reading count: concurrent workers cannot claim slot six.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily-selection:${dateKey}`}))::text`;
    const day = await tx.dailySelectionDay.upsert({where:{dateKey},create:{dateKey,policyVersion:DAILY_SELECTION_POLICY_VERSION,assembledAt:now},update:{},include:{items:{orderBy:{rank:"asc"}}}});
    if (day.policyVersion !== DAILY_SELECTION_POLICY_VERSION) return {status:"POLICY_MISMATCH" as const};
    const decision = selectDailyCandidates(currentCandidates,day.items,now);
    for (const [index,c] of decision.selected.entries()) {
      const source = currentCandidates.find(row=>row.id===c.id)!;
      const item = await tx.dailySelectionItem.create({data:{dayId:day.id,rank:day.items.length+index+1,fixtureId:c.fixtureId,leagueId:c.leagueId,kickoff:new Date(c.kickoff),marketKey:c.marketKey,cohortKey:c.cohortKey,tier:c.tier,decimalOdds:c.odds,bookmaker:c.bookmaker,quotedAt:new Date(c.oddsAt),publishedAt:now,snapshot:json({...source,...c})}});
      await tx.dailySelectionEvent.create({data:{eventKey:`published:${item.id}`,dayId:day.id,itemId:item.id,kind:"PUBLISHED",payload:json({rank:item.rank,at:now.toISOString()})}});
    }
    const reasons = [...sourceRejections,...decision.rejected].reduce<Record<string,number>>((acc,r)=>{acc[r.reason]=(acc[r.reason]??0)+1;return acc;},{});
    await tx.dailySelectionDay.update({where:{id:day.id},data:{emptyReason:day.items.length+decision.selected.length ? null:decision.emptyReason,summary:json({lastSelectionAt:now.toISOString(),considered:currentCandidates.length,rejections:reasons})}});
    return {status:"ASSEMBLED" as const,added:decision.selected.length,dateKey};
  },{timeout:10_000});
}

/** No inference, bootstrap, historical read, or write on the read path. */
export async function readDailySelection(dateKey: string, pro: boolean) {
  const day = await prisma.dailySelectionDay.findUnique({where:{dateKey},include:{items:{orderBy:{rank:"asc"},include:{events:{orderBy:{createdAt:"asc"}}}}}});
  const balance=await prisma.apiCache.findUnique({where:{key:dailyBalanceKey(day?.policyVersion??DAILY_SELECTION_POLICY_VERSION)},select:{payload:true}});
  if (!day) return {date:dateKey,policyVersion:DAILY_SELECTION_POLICY_VERSION,status:"NOT_ASSEMBLED",locked:!pro,counts:{documented:0,unverified:0},items:[],summary:{},balance:balance?.payload??null,emptyReason:"NOT_ASSEMBLED"};
  const counts={documented:day.items.filter(i=>i.tier==="DOCUMENTED_SOURCE").length,unverified:day.items.filter(i=>i.tier==="UNVERIFIED").length};
  return {date:dateKey,policyVersion:day.policyVersion,status:day.status,assembledAt:day.assembledAt.toISOString(),locked:!pro,counts,
    // Summary contains only aggregate counts; snapshots and prices stay behind PRO.
    summary:day.summary,balance:balance?.payload??null,emptyReason:day.emptyReason,items:pro?day.items:[]};
}
