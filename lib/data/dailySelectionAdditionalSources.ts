import "server-only";
import { prisma } from "../db";
import { pragueDateBounds } from "../recentWindow";
import { PUBLIC_CLUB_LEAGUE_IDS } from "./catalog";
import { qualifiedDailyTicketCandidates } from "./intuitionTicketStore";
import { INTUITION_POLICY_VERSION } from "../picks/intuitionTickets";
import { parseBooks } from "../picks/books";
import { comparableMarketQuote } from "../picks/comparableMarketQuote";
import { TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION, teamGoalOpportunityDecision } from "../picks/marketSignals";
import { PRESSURE_FLOW_V5_POLICY_VERSION, pressureFlowCandidates } from "../picks/pressureFlowV5";
import type { PerformancePressureShadowV5 } from "../picks/performancePressureShadowV5";
import { dailyEvidenceCohortKey } from "../picks/dailySelectionEvidence";
import { dailyEvidenceCacheKey } from "./dailySelectionSources";
import type { DailyEvidence } from "../picks/dailySelection";
import type { DailyPublicationCandidate } from "./dailySelectionStore";

export async function loadDailyAdditionalSources(date:string,now:Date) {
  const bounds=pragueDateBounds(date);
  const [signals,fixtures,tickets]=await Promise.all([
    prisma.marketSignalSnapshot.findMany({where:{kickoff:{gte:bounds.start,lt:bounds.end},leagueId:{in:[...PUBLIC_CLUB_LEAGUE_IDS]},OR:[{policyVersion:TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION,market:{startsWith:"TEAM_"}},{policyVersion:PRESSURE_FLOW_V5_POLICY_VERSION}]}}),
    prisma.fixturePrediction.findMany({where:{kickoff:{gte:bounds.start,lt:bounds.end},leagueId:{in:[...PUBLIC_CLUB_LEAGUE_IDS]},status:"NS",available:true},select:{fixtureId:true,leagueId:true,kickoff:true,homeTeamId:true,awayTeamId:true,homeName:true,awayName:true,modelVersion:true,contextVersion:true,modelContext:true,oddsCurrentAt:true,oddsCurrentBooks:true,inputSnapshot:true}}),
    qualifiedDailyTicketCandidates(date,now),
  ]);
  const byFixture=new Map(fixtures.map(f=>[f.fixtureId,f]));
  const candidates:DailyPublicationCandidate[]=[];
  const rejected:Array<{id:string;reason:string}>=[];
  // Same one-per-fixture team-goal source shortlist as Strategy Hub, at its frozen price.
  const teamWinners=new Map<number,{id:string;score:number}>();
  for(const r of signals.filter(r=>r.policyVersion===TEAM_GOAL_MARKET_SIGNAL_POLICY_VERSION)){
    const d=teamGoalOpportunityDecision({fixtureId:r.fixtureId,market:r.market,line:r.line,modelProbability:r.modelProbability,marketProbability:r.openMarketProbability,decimalOdds:r.decimalOdds});
    if(d.eligible&&(!teamWinners.has(r.fixtureId)||d.score>teamWinners.get(r.fixtureId)!.score))teamWinners.set(r.fixtureId,{id:r.id,score:d.score});
  }
  for(const row of signals) {
    const f=byFixture.get(row.fixtureId),v5=row.policyVersion===PRESSURE_FLOW_V5_POLICY_VERSION;
    const reject=(reason:string)=>rejected.push({id:row.id,reason});
    if(!v5&&teamWinners.get(row.fixtureId)?.id!==row.id){reject("NOT_IN_SOURCE_SHORTLIST");continue;}
    if(!f||!f.oddsCurrentAt||row.kickoff.getTime()!==f.kickoff.getTime()||row.openedAt>=row.kickoff||row.openedAt>now){reject("MISSING_OR_CHANGED_SOURCE");continue;}
    const snapshot=f.inputSnapshot as {capturedAt?:string;competition?:{homeTeamId:number;awayTeamId:number};performancePressure?:PerformancePressureShadowV5}|null;
    if(!snapshot?.competition||snapshot.competition.homeTeamId!==f.homeTeamId||snapshot.competition.awayTeamId!==f.awayTeamId||!snapshot.capturedAt||!(Date.parse(snapshot.capturedAt)<row.kickoff.getTime())||Date.parse(snapshot.capturedAt)>now.getTime()){reject("MISSING_FROZEN_IDENTITY");continue;}
    if(row.modelContext!==f.modelContext||row.contextVersion!==f.contextVersion||(!v5&&row.modelVersion!==f.modelVersion)){reject("MODEL_VERSION_CHANGED");continue;}
    const books=parseBooks(f.oddsCurrentBooks);
    let p=row.modelProbability;
    const market=row.market.startsWith("TEAM_HOME")?"TEAM_HOME":row.market.startsWith("TEAM_AWAY")?"TEAM_AWAY":row.market==="OVER_25"?"OVER_25":row.market==="BTTS"?"BTTS":null;
    if(!market||!Number.isFinite(p)||p<=0||p>=1){reject("INVALID_MARKET");continue;}
    const quote=comparableMarketQuote({books,market,side:row.side==="UNDER"?"UNDER":"OVER",line:row.line,sampledAt:f.oddsCurrentAt});
    if(!quote.bookmaker||quote.decimalOdds==null||quote.fairProbability==null){reject("NO_DIRECT_MARKET");continue;}
    if(v5){
      const pressure=snapshot.performancePressure;
      if(process.env.PRESSURE_V5_OPPORTUNITIES_ENABLED!=="true"||pressure?.version!==5){reject("RESEARCH_DISABLED");continue;}
      const current=pressureFlowCandidates(pressure,books,f.oddsCurrentAt).find(c=>c.market===row.market&&c.side===row.side&&c.line===row.line);
      if(!current||Math.abs(current.modelProbability-p)>1e-8){reject("CURRENT_PRICE_SOURCE_REJECTED");continue;}
    }else{
      const original=teamGoalOpportunityDecision({fixtureId:row.fixtureId,market:row.market,line:row.line,modelProbability:p,marketProbability:row.openMarketProbability,decimalOdds:row.decimalOdds});
      const current=teamGoalOpportunityDecision({fixtureId:row.fixtureId,market:row.market,line:row.line,modelProbability:p,marketProbability:quote.fairProbability,decimalOdds:quote.decimalOdds});
      if(!original.eligible||!current.eligible){reject("SOURCE_NOT_QUALIFIED");continue;}
      p=current.decisionProbability;
    }
    const strategy=v5?"PRESSURE_FLOW_V5":"TEAM_GOALS";
    const selection=market==="BTTS"?`Oba týmy skórují – ${row.side==="UNDER"?"ne":"ano"}`:`${market==="TEAM_HOME"?f.homeName:market==="TEAM_AWAY"?f.awayName:"Celkem"} ${row.side==="UNDER"?"méně":"více"} než ${row.line} gólu`;
    candidates.push({id:`SIGNAL:${row.id}`,sourceIds:[`SIGNAL:${row.id}`],cohortKey:dailyEvidenceCohortKey({...row,strategy}),fixtureId:f.fixtureId,leagueId:f.leagueId,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeName:f.homeName,awayName:f.awayName,kickoff:f.kickoff.toISOString(),marketKey:JSON.stringify([row.market,row.side,row.line]),odds:quote.decimalOdds,bookmaker:quote.bookmaker,oddsAt:f.oddsCurrentAt.toISOString(),priceKind:"DIRECT",qualified:true,currentPriceQualified:true,identityValid:true,blocked:false,warnings:["RESEARCH_SOURCE"],marketProbability:quote.fairProbability,benchmarkComparable:true,modelProbability:p,probabilityKind:v5?"PRESSURE_V5":"TEAM_CONSERVATIVE",evidence:null,strategy,selection,reason:"Již kvalifikovaný research výběr obstál i při současné ceně.",risk:"Výzkumná strategie bez doložené výhody."});
  }
  for(const group of tickets.groups) for(const leg of group.candidates) {
    const f=byFixture.get(leg.fixtureId);
    if(!f||!f.oddsCurrentAt||leg.priceKind!=="DIRECT"||!leg.decimalOdds||!leg.bookmaker)continue;
    // Qualification uses shared source engine; confirm the exact quote exists in the
    // timestamped current offer, never attach a fresh timestamp to fallback oddsBooks.
    const quoted=parseBooks(f.oddsCurrentBooks).some(b=>b.name===leg.bookmaker&&b.resultTotals?.some(q=>q.winner===leg.winner.toLowerCase()&&q.total===leg.total.toLowerCase()&&q.line===leg.line&&q.odds===leg.decimalOdds));
    if(!quoted){rejected.push({id:`${group.strategy}:${leg.fixtureId}`,reason:"NO_EXACT_CURRENT_COMBINATION"});continue;}
    candidates.push({id:`${group.strategy}:${leg.fixtureId}:${leg.winner}:${leg.total}:${leg.line}`,sourceIds:[`${group.strategy}:${leg.fixtureId}:${INTUITION_POLICY_VERSION}`],cohortKey:dailyEvidenceCohortKey({strategy:group.strategy,market:"RESULT_TOTAL",policyVersion:INTUITION_POLICY_VERSION,modelVersion:f.modelVersion,modelContext:f.modelContext,contextVersion:f.contextVersion}),fixtureId:f.fixtureId,leagueId:f.leagueId,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homeName:f.homeName,awayName:f.awayName,kickoff:f.kickoff.toISOString(),marketKey:JSON.stringify(["RESULT_TOTAL",leg.winner,leg.total,leg.line]),odds:leg.decimalOdds,bookmaker:leg.bookmaker,oddsAt:f.oddsCurrentAt.toISOString(),priceKind:"DIRECT",qualified:true,currentPriceQualified:true,identityValid:true,blocked:false,warnings:["NO_COMPARABLE_COMBINATION_BENCHMARK"],marketProbability:null,benchmarkComparable:false,modelProbability:group.strategy==="VALUE"?leg.decisionProbability??leg.modelProbability:leg.eloJointProbability??null,probabilityKind:group.strategy,evidence:null,strategy:group.strategy,selection:`${leg.winnerName} + ${leg.total==="OVER"?"více":"méně"} než ${leg.line} gólu`,reason:leg.reason,risk:leg.risk});
  }
  for(const c of candidates.filter(c=>c.strategy!=="VALUE"&&c.strategy!=="ELO_INTUITION")){
    const f=byFixture.get(c.fixtureId)!;
    const [rawMarket,side,line]=JSON.parse(c.marketKey);
    const market=rawMarket.startsWith("TEAM_HOME")?"TEAM_HOME":rawMarket.startsWith("TEAM_AWAY")?"TEAM_AWAY":rawMarket;
    c.quoteAudit=comparableMarketQuote({books:parseBooks(f.oddsCurrentBooks),market,side,line,sampledAt:f.oddsCurrentAt!});
  }
  const cache=await prisma.apiCache.findMany({where:{key:{in:candidates.map(c=>dailyEvidenceCacheKey(c.cohortKey))},expiresAt:{gt:now}}});
  const evidence=new Map(cache.map(r=>[r.key,r.payload as unknown as DailyEvidence]));
  for(const c of candidates)c.evidence=evidence.get(dailyEvidenceCacheKey(c.cohortKey))??null;
  return {candidates,rejected};
}
