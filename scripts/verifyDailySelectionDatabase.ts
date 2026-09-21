/** Integration verification only: all test rows are rolled back, never published. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
const marker=`verify-daily-${randomUUID()}`;
async function main(){
  let active=0,peak=0;
  await Promise.all([1,2].map(()=>prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${marker}))::text`;
    active++;peak=Math.max(peak,active);
    await tx.dailySelectionDay.count();active--;
  })));
  assert.equal(peak,1,"Transaction locks must serialize concurrent workers");
  const rollback=new Error("EXPECTED_ROLLBACK");
  try{
    await prisma.$transaction(async tx=>{
      const day=await tx.dailySelectionDay.create({data:{dateKey:marker,policyVersion:1,assembledAt:new Date()}});
      const item=await tx.dailySelectionItem.create({data:{dayId:day.id,rank:1,fixtureId:1,leagueId:1,kickoff:new Date(),marketKey:'["OVER_25","OVER",2.5]',cohortKey:"VERIFY",tier:"UNVERIFIED",decimalOdds:1.8,bookmaker:"VERIFY",quotedAt:new Date(),publishedAt:new Date(),snapshot:{verification:true}}});
      await tx.dailySelectionEvent.create({data:{eventKey:marker,dayId:day.id,itemId:item.id,kind:"VERIFY",payload:{}}});
      assert.equal((await tx.dailySelectionDay.findUniqueOrThrow({where:{id:day.id},include:{items:true}})).items.length,1);
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  assert.equal(await prisma.dailySelectionDay.count({where:{dateKey:marker}}),0);
  assert.equal(await prisma.dailySelectionEvent.count({where:{eventKey:marker}}),0);
  const constraints=await prisma.$queryRaw<Array<{definition:string}>>`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='"DailySelectionItem"'::regclass`;
  assert(constraints.some(c=>c.definition.includes("rank")&&c.definition.includes("5")),"Missing rank guardrail");
  assert(constraints.some(c=>c.definition.includes("decimalOdds")),"Missing direct-price range constraint");
  console.log(JSON.stringify({migrationTables:true,concurrentLockSerialized:peak===1,transactionRoundTrip:true,rollbackVerified:true,constraints:constraints.map(c=>c.definition)},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
