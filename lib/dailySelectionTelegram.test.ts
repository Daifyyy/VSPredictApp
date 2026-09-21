import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),tx:vi.fn(),find:vi.fn(),claim:vi.fn(),update:vi.fn(),incident:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./data/dailySelectionStore",()=>({readDailySelection:mocks.read}));
vi.mock("./db",()=>({prisma:{$transaction:mocks.tx,telegramPublication:{findMany:mocks.find,updateMany:mocks.claim,update:mocks.update}}}));
vi.mock("./operations",()=>({upsertIncident:mocks.incident}));
vi.mock("./telegram",()=>({telegramConfig:()=>({enabled:true,channelId:"channel",token:"test"}),pragueClock:()=>({date:"2026-09-21",hour:9}),shiftDateKey:()=>"2026-09-20"}));
import { dailySelectionMessageParts,publishDailySelectionTelegram } from "./dailySelectionTelegram";
type Day=Parameters<typeof dailySelectionMessageParts>[0];
const day=():Day=>({date:"2026-09-21",policyVersion:1,status:"ASSEMBLED",locked:false,counts:{documented:0,unverified:5},summary:{},balance:null,emptyReason:null,items:Array.from({length:5},(_,i)=>({id:String(i),rank:i+1,tier:"UNVERIFIED",decimalOdds:1.8,kickoff:new Date("2026-09-21T18:00:00Z"),outcome:"PENDING",status:"ACTIVE",snapshot:{homeName:"<&".repeat(100),awayName:"<&".repeat(100),selection:"<&".repeat(100),strategy:"<&".repeat(100)}})) as unknown as Day["items"]});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("DAILY_SELECTION_TELEGRAM_ENABLED","true");mocks.read.mockResolvedValue(day());mocks.incident.mockResolvedValue({});});
it("escapes HTML, splits whole blocks and tracks precisely which picks are in each part",()=>{
  const parts=dailySelectionMessageParts(day());
  expect(parts.length).toBeGreaterThan(1);expect(parts.every(p=>p.text.length<4096)).toBe(true);
  expect(parts.flatMap(p=>p.itemIds)).toEqual(["0","1","2","3","4"]);
  for(const p of parts){expect(p.text).not.toContain("<&");expect(p.text.match(/<b>/g)?.length??0).toBe(p.text.match(/<\/b>/g)?.length??0);}
});
it("dry run never creates publications or sends Telegram requests",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  expect((await publishDailySelectionTelegram(new Date(),false,true)).status).toBe("DRY_RUN");expect(mocks.tx).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it("ambiguous timeout becomes UNKNOWN and cannot be claimed again",async()=>{
  let status="PENDING";
  mocks.tx.mockResolvedValue(undefined);
  mocks.find.mockImplementation(async({where})=>where.status==="PENDING"&&status==="PENDING"?[{id:"pub",payload:{text:"test"}}]:[]);
  mocks.claim.mockImplementation(async()=>({count:status==="PENDING"?(status="SENDING",1):0}));
  mocks.update.mockImplementation(async({data})=>{status=data.status;});
  const fetch=vi.fn().mockRejectedValue(new Error("timeout"));vi.stubGlobal("fetch",fetch);
  await publishDailySelectionTelegram(new Date());expect(status).toBe("UNKNOWN");expect(mocks.incident).toHaveBeenCalled();
  await publishDailySelectionTelegram(new Date());expect(fetch).toHaveBeenCalledTimes(1);
});
