// Explicit, bounded operational check. One read-only SQL query; never runs from a cron or page.
import { prisma } from "../lib/db";
import { isDateKey } from "../lib/picks/strategyHub";
import { pragueDateBounds } from "../lib/recentWindow";
import { normalizeOneXTwoDaily, oneXTwoDailyQuery } from "../lib/data/oneXTwoDailyProjection";
const date=process.argv[2];
if(!date||!isDateKey(date)) throw Error("Pass an explicit YYYY-MM-DD date");
async function main(){
  const bounds=pragueDateBounds(date);
  const rows=await prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000'");
    return tx.$queryRaw<Parameters<typeof normalizeOneXTwoDaily>[0]>(oneXTwoDailyQuery(bounds.start,bounds.end));
  },{timeout:15000});
  const valid=normalizeOneXTwoDaily(rows);
  console.log(JSON.stringify({date,readRows:rows.length,valid:valid.length,withBenchmark:valid.filter(r=>r.market).length,
    modelVersions:[...new Set(valid.map(r=>r.modelVersion))],payloadBytes:Buffer.byteLength(JSON.stringify(valid)),
    truncated:rows.length>200,firstCapture:valid[0]?.capturedAt??null,lastCapture:valid.at(-1)?.capturedAt??null,
    inferenceCalls:0,providerCalls:0},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}).finally(()=>prisma.$disconnect());
