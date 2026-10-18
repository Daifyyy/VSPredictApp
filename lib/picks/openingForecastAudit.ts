import type { PredictionRow } from "../types";
import type { BookOdds } from "../data/apiFootball";
import { CLV_BOOKMAKER_PANEL } from "./comparableMarketQuote";

/** Small immutable audit, not a new selection rule or a replacement for CLV v2. */
export function openingForecastAudit(row: PredictionRow, books: BookOdds[], at: Date) {
  const captured=at.getTime(),predicted=Date.parse(row.modelCalculatedAt??""),kickoff=Date.parse(row.kickoff);
  if(!Number.isFinite(captured)||!Number.isFinite(predicted)||!Number.isFinite(kickoff)||predicted>captured||captured>=kickoff||row.status!=="NS"||!row.available)return null;
  if(![row.fixtureId,row.homeTeamId,row.awayTeamId].every(x=>Number.isInteger(x)&&x>0)||row.homeTeamId===row.awayTeamId)return null;
  const model=[row.homeWin,row.draw,row.awayWin];
  if(!model.every(x=>Number.isFinite(x)&&x>=0&&x<=1)||Math.abs(model.reduce((a,b)=>a+b,0)-1)>1e-6)return null;
  const quotes=CLV_BOOKMAKER_PANEL.flatMap(id=>{
    // Ambiguous duplicated books are not counted twice or arbitrarily chosen.
    const matches=books.filter(b=>b.id===id);if(matches.length!==1)return [];
    const b=matches[0],odds=[b.home,b.draw,b.away];
    if(!b.name||!odds.every(x=>typeof x==="number"&&Number.isFinite(x)&&x>1))return [];
    const raw=odds as number[],sum=raw.reduce((s,x)=>s+1/x,0);
    return [{id,name:b.name.slice(0,100),odds:raw,fair:raw.map(x=>1/x/sum)}];
  });
  if(!quotes.length)return null;
  const quality=quotes.length>=2?"PANEL":quotes[0].id===4?"PINNACLE_SINGLE":"UNAVAILABLE";
  // Sidewise logit medians are normalized for a coherent multinomial vector.
  // Existing scalar CLV benchmarks deliberately remain unchanged.
  const median=(xs:number[])=>{xs.sort((a,b)=>a-b);const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;};
  const rawFair=[0,1,2].map(i=>1/(1+Math.exp(-median(quotes.map(q=>Math.log(q.fair[i]/(1-q.fair[i])))))));
  const sum=rawFair.reduce((a,b)=>a+b,0);
  return {version:1,method:"NORMALIZED_PANEL_LOGIT_MEDIAN_1X2_V1",fixtureId:row.fixtureId,homeTeamId:row.homeTeamId,awayTeamId:row.awayTeamId,
    kickoff:row.kickoff,capturedAt:at.toISOString(),predictedAt:row.modelCalculatedAt!,
    quoteTimeBasis:"COLLECTOR_OBSERVED_AT",providerUpdatedAt:null,
    modelVersion:row.modelVersion,contextVersion:row.contextVersion??1,modelContext:row.modelContext??"LEAGUE",
    modelParameters:{rho:row.rho??null,sharpen:row.sharpen??null,calibA:row.calibA??null,calibB:row.calibB??null},
    model,market:quality==="UNAVAILABLE"?null:rawFair.map(p=>p/sum),quality,quotes};
}
