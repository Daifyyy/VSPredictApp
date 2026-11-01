import { forecastLoss, pairedForecastInterval, scoreForecasts, type BenchmarkRow, type ForecastVector } from "./forecastBenchmark";

export const LOCAL_CALIBRATION_PROTOCOL = {
  version:1, source:"stabilized100", temperatures:[.8,1,1.2,1.5,2], overIntercepts:[-.2,-.1,0,.1,.2],
  trainDayShare:.6, validationDayShare:.2, minimumRows:[100,50,50], minimumValidationGain:.002,
  activation:"FORBIDDEN_DEVELOPMENT_ONLY",
} as const;
export type CalibrationParameters={overTemperature:number;overIntercept:number;oneXTwoTemperature:number};
const identity:CalibrationParameters={overTemperature:1,overIntercept:0,oneXTwoTemperature:1};
const day=(r:BenchmarkRow)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Prague"}).format(new Date(r.date));
export function calibrateForecast(p:ForecastVector,params:CalibrationParameters):ForecastVector {
  if(!Number.isFinite(params.overTemperature)||params.overTemperature<=0||!Number.isFinite(params.oneXTwoTemperature)||params.oneXTwoTemperature<=0||!Number.isFinite(params.overIntercept))throw Error("INVALID_PARAMETERS");
  const bounded=Math.max(1e-9,Math.min(1-1e-9,p.over));
  const scores=p.oneXTwo.map(x=>Math.log(Math.max(1e-9,x))/params.oneXTwoTemperature),max=Math.max(...scores),weights=scores.map(x=>Math.exp(x-max)),sum=weights.reduce((a,b)=>a+b,0);
  return {over:params.overTemperature===1&&params.overIntercept===0?p.over:1/(1+Math.exp(-(Math.log(bounded/(1-bounded))/params.overTemperature+params.overIntercept))),oneXTwo:params.oneXTwoTemperature===1?[...p.oneXTwo]:weights.map(x=>x/sum) as [number,number,number]};
}
export function calibrationDaySplit(rows:BenchmarkRow[]){
  const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.fixtureId-b.fixtureId),days=[...new Set(sorted.map(day))].sort();
  const a=Math.floor(days.length*.6),b=Math.floor(days.length*.8),trainDays=new Set(days.slice(0,a)),validationDays=new Set(days.slice(a,b));
  return {train:sorted.filter(r=>trainDays.has(day(r))),validation:sorted.filter(r=>validationDays.has(day(r))),test:sorted.filter(r=>!trainDays.has(day(r))&&!validationDays.has(day(r)))};
}
const apply=(rows:BenchmarkRow[],parameters:CalibrationParameters)=>rows.map(r=>({...r,forecasts:{baseline:r.forecasts.stabilized100,candidate:calibrateForecast(r.forecasts.stabilized100,parameters)}}));
const averageLoss=(rows:BenchmarkRow[],parameters:CalibrationParameters,market:"over"|"oneXTwo")=>apply(rows,parameters).reduce((s,r)=>s+forecastLoss(r,"candidate")[market],0)/rows.length;
/** Fixed grids, fit on training only; validation can retain the baseline per market. */
export function runLocalCalibrationExperiment(rows:BenchmarkRow[]){
  scoreForecasts(rows,[LOCAL_CALIBRATION_PROTOCOL.source]);
  const split=calibrationDaySplit(rows),counts={train:split.train.length,validation:split.validation.length,test:split.test.length};
  const ranges=Object.fromEntries(Object.entries(split).map(([k,rs])=>[k,{from:rs[0]?.date??null,to:rs.at(-1)?.date??null,days:new Set(rs.map(day)).size}]));
  if(counts.train<100||counts.validation<50||counts.test<50)return {protocol:LOCAL_CALIBRATION_PROTOCOL,status:"INSUFFICIENT_SAMPLE",counts,ranges};
  // Identity first: equal scores do not create needless calibration.
  const overCandidates=[identity,...LOCAL_CALIBRATION_PROTOCOL.temperatures.flatMap(overTemperature=>LOCAL_CALIBRATION_PROTOCOL.overIntercepts.map(overIntercept=>({...identity,overTemperature,overIntercept})))];
  const outcomeCandidates=[identity,...LOCAL_CALIBRATION_PROTOCOL.temperatures.map(oneXTwoTemperature=>({...identity,oneXTwoTemperature}))];
  const best=(candidates:CalibrationParameters[],market:"over"|"oneXTwo")=>candidates.reduce((a,b)=>averageLoss(split.train,b,market)<averageLoss(split.train,a,market)-1e-12?b:a);
  const over=best(overCandidates,"over"),outcome=best(outcomeCandidates,"oneXTwo");
  const gain=(p:CalibrationParameters,m:"over"|"oneXTwo")=>averageLoss(split.validation,identity,m)-averageLoss(split.validation,p,m);
  const validationGains={over:gain(over,"over"),oneXTwo:gain(outcome,"oneXTwo")};
  const accepted={over:validationGains.over>=.002,oneXTwo:validationGains.oneXTwo>=.002};
  const parameters={overTemperature:accepted.over?over.overTemperature:1,overIntercept:accepted.over?over.overIntercept:0,oneXTwoTemperature:accepted.oneXTwo?outcome.oneXTwoTemperature:1};
  const test=apply(split.test,parameters);
  const edge=(x:number,grid:readonly number[])=>x===grid[0]||x===grid.at(-1);
  const gridEdge={over:edge(over.overTemperature,LOCAL_CALIBRATION_PROTOCOL.temperatures)||edge(over.overIntercept,LOCAL_CALIBRATION_PROTOCOL.overIntercepts),oneXTwo:edge(outcome.oneXTwoTemperature,LOCAL_CALIBRATION_PROTOCOL.temperatures)};
  return {protocol:LOCAL_CALIBRATION_PROTOCOL,status:"DEVELOPMENT_ONLY",counts,ranges,trainingWinners:{over,outcome},gridEdge,validationGains,selectedOnValidation:accepted,parameters,
    test:scoreForecasts(test,["baseline","candidate"]),pairedTest:{over:pairedForecastInterval(test,"candidate","baseline","over"),oneXTwo:pairedForecastInterval(test,"candidate","baseline","oneXTwo")},
    segments:[...new Set(test.map(r=>r.leagueId))].map(leagueId=>({leagueId,metrics:scoreForecasts(test.filter(r=>r.leagueId===leagueId),["baseline","candidate"])})),
    limitations:["Previously explored goals-only reconstructed data; terminal partition is not an untouched external holdout.","No prices or complete historical 1X2 market benchmark. No ROI, CLV or edge conclusion.","Separate probability calibration is not a new coherent goal-distribution model.","Small terminal segments and intervals are descriptive; no production activation or parameter export."]};
}
