import { beforeEach,expect,it,vi } from "vitest";
import type { DailyPublicationCandidate } from "./dailySelectionStore";
const mocks=vi.hoisted(()=>({transaction:vi.fn(),read:vi.fn(),cache:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../db",()=>({prisma:{$transaction:mocks.transaction,dailySelectionDay:{findUnique:mocks.read},apiCache:{findUnique:mocks.cache}}}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:mocks.transaction,dailySelectionDay:{findUnique:mocks.read},apiCache:{findUnique:mocks.cache}}}));
import { appendDailySelection,readDailySelection } from "./dailySelectionStore";
const now=new Date("2026-09-21T07:00:00Z");
const candidate=(id:number):DailyPublicationCandidate=>({id:String(id),sourceIds:[String(id)],cohortKey:"test",fixtureId:id,leagueId:id,homeTeamId:10,awayTeamId:20,homeName:"Home",awayName:"Away",kickoff:"2026-09-21T18:00:00Z",marketKey:JSON.stringify(["OVER_25","OVER",2.5]),odds:1.8,bookmaker:"Book",oddsAt:now.toISOString(),priceKind:"DIRECT",qualified:true,currentPriceQualified:true,identityValid:true,blocked:false,warnings:[],marketProbability:.6,benchmarkComparable:true,modelProbability:.65,probabilityKind:"MAIN_TOTAL",evidence:null,strategy:"OVER_25",selection:"Over 2,5",reason:"Source qualified",risk:"Research"});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("DAILY_SELECTION_COLLECT_ENABLED","true");mocks.cache.mockResolvedValue(null);});
it("locks before reading slots and never replaces published prices on restart",async()=>{
  const items:Array<Record<string,unknown>>=[];const events:unknown[]=[];let locked=false;
  const tx={$queryRaw:vi.fn(async()=>{locked=true;}),dailySelectionDay:{upsert:vi.fn(async()=>{expect(locked).toBe(true);return {id:"day",policyVersion:1,items:[...items]};}),update:vi.fn()},dailySelectionItem:{create:vi.fn(async({data})=>{const item={id:`item-${items.length}`, ...data};items.push(item);return item;})},dailySelectionEvent:{create:vi.fn(async({data})=>events.push(data))}};
  mocks.transaction.mockImplementation(async fn=>{locked=false;return fn(tx);});
  await appendDailySelection(Array.from({length:7},(_,i)=>candidate(i+1)),now);
  expect(items).toHaveLength(5);
  const frozen=JSON.stringify(items);
  await appendDailySelection([{...candidate(1),odds:2.5},candidate(8)],new Date(now.getTime()+1000));
  expect(JSON.stringify(items)).toBe(frozen);expect(events).toHaveLength(5);
});
it("keeps dry run read only and accounts for previous publications",async()=>{
  mocks.read.mockResolvedValue({items:Array.from({length:5},(_,i)=>({fixtureId:i+10,leagueId:i+10}))});
  const result=await appendDailySelection([candidate(1)],now,true);
  expect(result.status).toBe("DRY_RUN");expect(mocks.transaction).not.toHaveBeenCalled();
  expect("selected" in result&&result.selected).toEqual([]);
});
it("redacts snapshots and events server-side",async()=>{
  mocks.read.mockResolvedValue({dateKey:"2026-09-21",policyVersion:1,status:"ASSEMBLED",assembledAt:now,summary:{},emptyReason:null,items:[{tier:"UNVERIFIED",snapshot:{secret:"tip"},events:[{payload:"private"}]}]});
  const data=await readDailySelection("2026-09-21",false);
  expect(data.items).toEqual([]);expect(JSON.stringify(data)).not.toContain("private");expect(data.counts.unverified).toBe(1);
});
it.each(["2026-09-21T06:59:59Z","2026-12-01T07:59:59Z"])("respects Prague publication time including DST: %s",async iso=>{
  expect((await appendDailySelection([],new Date(iso))).status).toBe("BEFORE_PUBLICATION");expect(mocks.transaction).not.toHaveBeenCalled();
});
