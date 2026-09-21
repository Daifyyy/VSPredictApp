import { binaryOutcome, FINAL_STATUSES } from "./evaluation";

export type DailyOutcome = "PENDING" | "WON" | "LOST" | "VOID" | "UNEVALUABLE";
export function settleDailyMarket(input:{marketKey:string;status:string;home:number|null;away:number|null;actualCount?:number|null;identityValid:boolean}):DailyOutcome {
  if(!input.identityValid) return "UNEVALUABLE";
  if(input.status==="CANC") return "VOID";
  // Postponed/abandoned fixtures are not assumed void without a final market decision.
  if(!FINAL_STATUSES.has(input.status)) return "PENDING";
  let key:unknown; try {key=JSON.parse(input.marketKey);} catch {return "UNEVALUABLE";}
  if(!Array.isArray(key))return "UNEVALUABLE";
  const [market,side,lineOrTotal,comboLine]=key;
  if(market==="RESULT_TOTAL"){
    if(!["HOME","AWAY"].includes(side)||!["OVER","UNDER"].includes(lineOrTotal)||typeof comboLine!=="number")return "UNEVALUABLE";
    if(input.home==null||input.away==null)return "PENDING";
    const winner=binaryOutcome("1X2",side,input.home,input.away);
    const total=input.home+input.away;
    if(!winner)return "LOST";
    // Combination settlement with a pushed leg depends on bookmaker rules: no invented payout.
    if(total===comboLine)return "UNEVALUABLE";
    return (lineOrTotal==="OVER"?total>comboLine:total<comboLine)?"WON":"LOST";
  }
  const line=typeof lineOrTotal==="number"?lineOrTotal:null;
  const count=["CORNERS","CARDS","FOULS"].includes(market)?input.actualCount:
    typeof market==="string"&&market.startsWith("TEAM_HOME")?input.home:
    typeof market==="string"&&market.startsWith("TEAM_AWAY")?input.away:null;
  if(count!=null&&line!=null&&count===line)return "VOID";
  const hit=binaryOutcome(market,side,input.home,input.away,line,input.actualCount??null);
  return hit==null?"PENDING":hit?"WON":"LOST";
}

export interface DailyBalance {published:number;won:number;lost:number;void:number;pending:number;unevaluable:number;profit:number;roi:number|null;hitRate:number|null;averageOdds:number|null}
export function dailyBalance(rows:Array<{outcome:string;profit:number|null;decimalOdds:number}>):DailyBalance {
  const won=rows.filter(r=>r.outcome==="WON").length,lost=rows.filter(r=>r.outcome==="LOST").length;
  const settled=rows.filter(r=>r.outcome==="WON"||r.outcome==="LOST");
  const profit=settled.reduce((sum,r)=>sum+(r.profit??0),0);
  return {published:rows.length,won,lost,void:rows.filter(r=>r.outcome==="VOID").length,pending:rows.filter(r=>r.outcome==="PENDING").length,unevaluable:rows.filter(r=>r.outcome==="UNEVALUABLE").length,profit,roi:settled.length?profit/settled.length:null,hitRate:settled.length?won/settled.length:null,averageOdds:rows.length?rows.reduce((s,r)=>s+r.decimalOdds,0)/rows.length:null};
}
