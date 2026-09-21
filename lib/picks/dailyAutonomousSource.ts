import type { AutonomousTipSnapshot } from "@prisma/client";
import { AUTONOMOUS_POLICY_VERSION, evaluateAutonomousTip, type AutonomousStrategy } from "./autonomousPortfolio";
import { comparableMarketQuote, type ComparableMarket, type ComparableSide } from "./comparableMarketQuote";
import { parseBooks } from "./books";
import { dailyEvidenceCohortKey } from "./dailySelectionEvidence";
import type { DailyEvidence } from "./dailySelection";
import type { DailyPublicationCandidate } from "../data/dailySelectionStore";

export interface DailyFixtureQuote {
  fixtureId:number; leagueId:number; homeTeamId:number; awayTeamId:number; kickoff:Date;
  homeName:string; awayName:string; status:string; available:boolean; modelVersion:number; modelContext:string;
  contextVersion:number; oddsCurrentAt:Date|null; oddsCurrentBooks:unknown;
  lowConfidence:boolean; readinessSample:number; homeWin:number; draw:number; awayWin:number;
  countModelVersion:number|null; foulModelVersion:number|null;
}
export type DailyAutonomousRow = Pick<AutonomousTipSnapshot,
  "id"|"fixtureId"|"leagueId"|"homeTeamId"|"awayTeamId"|"homeName"|"awayName"|"kickoff"|"strategy"|"policyVersion"|"status"|"qualifiedAt"|"market"|"side"|"line"|"modelVersion"|"modelContext"|"contextVersion"|"countModelVersion"|"modelProbability"|"modelInputSnapshot"|"sampleCount">;
export function dailyAutonomousCandidate(row: DailyAutonomousRow, fixture: DailyFixtureQuote,
  evidence:DailyEvidence|null, now:Date, blocked=false): {candidate:DailyPublicationCandidate|null;reason:string|null} {
  const reject=(reason:string)=>({candidate:null,reason});
  const strategy=row.strategy as AutonomousStrategy;
  if(!(strategy in AUTONOMOUS_POLICY_VERSION)||row.policyVersion!==AUTONOMOUS_POLICY_VERSION[strategy]||row.status!=="candidate") return reject("INACTIVE_SOURCE_POLICY");
  if(!row.qualifiedAt||row.qualifiedAt>=row.kickoff||row.qualifiedAt>now) return reject("NOT_PREMATCH_QUALIFIED");
  if(!Number.isFinite(row.modelProbability)||row.modelProbability<=0||row.modelProbability>=1) return reject("INVALID_FROZEN_PROBABILITY");
  if(!fixture.available||fixture.status!=="NS"||row.fixtureId!==fixture.fixtureId||row.leagueId!==fixture.leagueId||row.homeTeamId!==fixture.homeTeamId||row.awayTeamId!==fixture.awayTeamId||row.kickoff.getTime()!==fixture.kickoff.getTime()) return reject("FIXTURE_CHANGED_OR_UNAVAILABLE");
  if(row.modelVersion!==fixture.modelVersion||row.modelContext!==fixture.modelContext||row.contextVersion!==fixture.contextVersion) return reject("MODEL_VERSION_CHANGED");
  if(["CORNERS","CARDS_REF","FOULS"].includes(strategy) && row.countModelVersion!==(strategy==="FOULS"?fixture.foulModelVersion:fixture.countModelVersion)) return reject("COUNT_VERSION_CHANGED");
  if(!fixture.oddsCurrentAt) return reject("MISSING_QUOTE_TIME");
  if(!["1X2","OVER_25","BTTS","CORNERS","CARDS","FOULS"].includes(row.market)||!["HOME","AWAY","DRAW","OVER","UNDER"].includes(row.side)) return reject("UNSUPPORTED_MARKET");
  const quote=comparableMarketQuote({books:parseBooks(fixture.oddsCurrentBooks),market:row.market as ComparableMarket,side:row.side as ComparableSide,line:row.line,sampledAt:fixture.oddsCurrentAt});
  if(!quote.bookmaker||quote.decimalOdds==null||quote.fairProbability==null) return reject("MISSING_COMPARABLE_QUOTE");
  const snap=row.modelInputSnapshot as {readinessSample?:unknown}|null;
  const readiness=typeof snap?.readinessSample==="number"?Math.min(snap.readinessSample,fixture.readinessSample):null;
  if(readiness==null||!Number.isFinite(readiness)) return reject("MISSING_FROZEN_READINESS");
  const decision=evaluateAutonomousTip({strategy,modelProbability:row.modelProbability,marketProbability:quote.fairProbability,decimalOdds:quote.decimalOdds,
    secondProbability:strategy==="ONE_X_TWO"?Math.max(fixture.draw,row.side==="HOME"?fixture.awayWin:fixture.homeWin):undefined,
    readinessSample:readiness,lowConfidence:fixture.lowConfidence,sampleCount:row.sampleCount,minutesToKickoff:(row.kickoff.getTime()-now.getTime())/60_000});
  if(decision.status!=="candidate") return reject("CURRENT_PRICE_SOURCE_REJECTED");
  const selection=row.market==="1X2"?`Výhra ${row.side==="HOME"?row.homeName:row.awayName}`:row.market==="BTTS"?"Oba týmy skórují – ano":`${row.side==="UNDER"?"Méně":"Více"} než ${row.line} ${row.market==="CORNERS"?"rohů":row.market==="CARDS"?"karet":row.market==="FOULS"?"faulů":"gólu"}`;
  return {reason:null,candidate:{id:`AUTONOMOUS:${row.id}`,sourceIds:[`AUTONOMOUS:${row.id}`],cohortKey:dailyEvidenceCohortKey(row),fixtureId:row.fixtureId,leagueId:row.leagueId,
    homeTeamId:row.homeTeamId,awayTeamId:row.awayTeamId,homeName:row.homeName,awayName:row.awayName,kickoff:row.kickoff.toISOString(),marketKey:JSON.stringify([row.market,row.side,row.line]),
    odds:quote.decimalOdds,bookmaker:quote.bookmaker,oddsAt:fixture.oddsCurrentAt.toISOString(),quoteAudit:quote,priceKind:"DIRECT",qualified:true,currentPriceQualified:true,identityValid:true,blocked,
    warnings:quote.benchmarkQuality==="PANEL"?[]:["SINGLE_BOOK_BENCHMARK"],marketProbability:quote.fairProbability,benchmarkComparable:true,modelProbability:row.modelProbability,probabilityKind:row.market==="1X2"?"MAIN_1X2":row.market==="BTTS"?"MAIN_BTTS":row.market==="OVER_25"?"MAIN_TOTAL":"COUNT",
    evidence,strategy,selection,reason:"Výběr prošel pravidly zdrojové strategie i kontrolou aktuální přímé ceny.",risk:"Výhoda tohoto denního selektoru zatím není prospektivně doložena."}};
}
