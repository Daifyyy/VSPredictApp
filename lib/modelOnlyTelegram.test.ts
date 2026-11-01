import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({read:vi.fn(),fixtures:vi.fn(),prior:vi.fn(),upsert:vi.fn(),claim:vi.fn(),update:vi.fn(),send:vi.fn(),incident:vi.fn(),cursor:vi.fn(),day:vi.fn()}));
vi.mock('./db',()=>({prisma:{modelOnlyForecast:{findMany:m.read},fixturePrediction:{findMany:m.fixtures},modelOnlyDay:{findUnique:m.day},telegramPublication:{findUnique:m.prior,upsert:m.upsert,updateMany:m.claim,update:m.update},telegramCommandCursor:{findUnique:m.cursor,upsert:vi.fn()}}}));
vi.mock('./resourceBudgetGuard',()=>({resourceBudgetGuard:async()=>null}));
vi.mock('./operations',()=>({upsertIncident:m.incident}));
vi.mock('./telegram',()=>({telegramConfig:()=>({enabled:true,token:'test',channelId:'channel',allowedUsers:new Set(['owner'])}),sendTelegramMessages:m.send,splitTelegramBlocks:(rows:string[])=>[rows.join('\n')],pragueClock:()=>({date:'2026-10-31',hour:9}),shiftDateKey:()=> '2026-10-30',isTelegramDateAllowed:()=>true}));
import { handleModelCommand,publishModelMorning,formatModelMessages } from './modelOnlyTelegram';
const now=new Date('2026-10-31T08:00:00Z');
const row={id:'a',fixtureId:1,source:'ORIGINAL_OVER',homeTeamId:1,awayTeamId:2,homeName:'<A>',awayName:'B',market:'OVER_25',side:'OVER',line:2.5,probability:.65,kickoff:new Date('2026-10-31T18:00:00Z'),outcome:'PENDING',status:'NS',available:true};
beforeEach(()=>{vi.clearAllMocks();m.prior.mockResolvedValue(null);m.read.mockResolvedValue([row]);m.fixtures.mockResolvedValue([row]);m.claim.mockResolvedValue({count:1});m.upsert.mockResolvedValue({id:'pub',payload:{messages:['frozen']},status:'PENDING'});m.send.mockResolvedValue([1]);m.update.mockResolvedValue({});m.incident.mockResolvedValue({});});
it('checks authorization before reads',async()=>{expect(await handleModelCommand('stranger','/tipy',now)).toEqual([]);expect(m.read).not.toHaveBeenCalled();});
it('formats the same model probability without prices and escapes names',()=>{const message=formatModelMessages('2026-10-31',[row]).join('');expect(message).toContain('65');expect(message).toContain('&lt;A&gt;');expect(message).not.toContain('EV');});
it('does not publish a moved fixture as an upcoming recommendation',async()=>{m.fixtures.mockResolvedValue([{...row,status:'PST'}]);const result=await handleModelCommand('owner','/tipy over25',now);expect(result.join('')).toContain('Žádné');});
it('dry run does not create or claim publications',async()=>{await publishModelMorning(now,{dryRun:true});expect(m.upsert).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();});
it('marks ambiguous delivery UNKNOWN and does not retry it',async()=>{
 m.send.mockRejectedValue(Error('timeout'));await expect(publishModelMorning(now)).rejects.toThrow('timeout');
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'UNKNOWN'})}));
 m.claim.mockResolvedValue({count:0});await publishModelMorning(now);expect(m.send).toHaveBeenCalledTimes(1);
});
it('serves all qualified team variants via the same ledger, not legacy prices',async()=>{
 const team={...row,source:'TEAM_AWAY_15',market:'TEAM_AWAY_15',line:1.5};
 m.read.mockResolvedValue([team]);
 const messages=await handleModelCommand('owner','/tipy tymove_goly',now);
 expect(m.read.mock.calls[0][0].where).toMatchObject({policyVersion:2004,qualified:true,source:{startsWith:'TEAM_'}});
 expect(messages.join('')).toContain('Hosté dají alespoň 2 góly');
});
it('labels the frozen outsider decision without inferring it from current teams',()=>{
 const messages=formatModelMessages('2026-11-01',[{...row,market:'TEAM_AWAY_05',source:'TEAM_AWAY_05',line:.5,reason:'MODEL_UNDERDOG_GOAL_THRESHOLD_MET'}]);
 expect(messages.join('')).toContain('outsider podle modelu');
});
