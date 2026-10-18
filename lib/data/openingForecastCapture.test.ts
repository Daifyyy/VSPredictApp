import {afterEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({upsert:vi.fn(),row:{fixtureId:1,homeTeamId:10,awayTeamId:20,leagueId:39,kickoff:"2026-10-20T18:00:00Z",modelCalculatedAt:"2026-10-20T10:00:00Z",status:"NS",available:true,homeWin:.5,draw:.3,awayWin:.2,over25:.6,modelVersion:7,contextVersion:1,modelContext:"LEAGUE"}}));
vi.mock("@/lib/db",()=>({prisma:{marketSignalSnapshot:{upsert:mocks.upsert}}}));
vi.mock("./predictionStore",()=>({getPredictionByFixture:async()=>mocks.row}));
import {openMarketSignals} from "./marketSignalStore";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it("only adds the audit to creation, never backfills or overwrites existing records",async()=>{
  vi.stubEnv("OPENING_FORECAST_AUDIT_ENABLED","true");vi.stubEnv("PRESSURE_V5_OPPORTUNITIES_ENABLED","false");
  const books=[{id:4,name:"Pinnacle",home:2,draw:3,away:4,over25:null,under25:null,btts:null,bttsNo:null}];
  await openMarketSignals(1,books,new Date("2026-10-20T12:00:00Z"));
  await openMarketSignals(1,books,new Date("2026-10-20T13:00:00Z"));
  expect(mocks.upsert).toHaveBeenCalledTimes(2);
  for(const [args] of mocks.upsert.mock.calls){expect(args.create.openingForecastAudit.model).toEqual([.5,.3,.2]);expect(args.update).toEqual({});expect(args.where.fixtureId_market_policyVersion).toEqual({fixtureId:1,market:"1X2",policyVersion:1});}
});
it("keeps audit capture disabled by default",async()=>{vi.stubEnv("OPENING_FORECAST_AUDIT_ENABLED","false");await openMarketSignals(1,[{id:4,name:"Pinnacle",home:2,draw:3,away:4,over25:null,under25:null,btts:null,bttsNo:null}],new Date("2026-10-20T12:00:00Z"));expect(mocks.upsert.mock.calls[0][0].create).not.toHaveProperty("openingForecastAudit");});
