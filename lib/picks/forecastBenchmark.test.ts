import { describe, expect, it } from "vitest";
import { benchmarkTrainingBefore, forecastLoss, pairedForecastInterval, scoreForecasts, validateForecast, type BenchmarkRow } from "./forecastBenchmark";
const row:BenchmarkRow={fixtureId:1,leagueId:39,date:"2026-09-01T12:00:00Z",homeGoals:1,awayGoals:1,forecasts:{a:{over:.25,oneXTwo:[.2,.5,.3]},b:{over:.25,oneXTwo:[.2,.5,.3]}}};
describe("full forecast benchmark",()=>{
  it("does not use same-day, future, unfinished or exact-boundary observations",()=>{
    const dates=["2026-08-31T20:59:59Z","2026-08-31T21:00:00Z","2026-08-31T23:00:00Z","2026-09-01T12:00:00Z","2026-09-02T12:00:00Z"].map(date=>({date}));
    expect(benchmarkTrainingBefore(dates,Date.parse("2026-09-01"))).toEqual([dates[0]]);
  });
  it("scores all three outcomes, including a draw",()=>{
    expect(forecastLoss(row,"a").oneXTwo).toBeCloseTo(-Math.log(.5));
    expect(forecastLoss(row,"a").oneXTwoBrier).toBeCloseTo(.04+.25+.09);
    expect(forecastLoss(row,"a").over).toBeCloseTo(-Math.log(.75));
  });
  it("rejects duplicate fixtures, missing comparator and incoherent probabilities",()=>{
    expect(()=>scoreForecasts([row,row],["a"])).toThrow("DUPLICATE");
    expect(()=>scoreForecasts([row],["missing"])).toThrow("INVALID_SHARED");
    expect(validateForecast({over:.5,oneXTwo:[.5,.5,.5]})).toBe(false);
    expect(validateForecast({over:NaN,oneXTwo:[.2,.5,.3]})).toBe(false);
    expect(()=>scoreForecasts([{...row,homeGoals:-1}],["a"])).toThrow("INVALID_OUTCOME");
  });
  it("uses exactly the same denominator and never turns an empty cohort into zero error",()=>{
    const score=scoreForecasts([row],["a","b"]);
    expect(score.a.n).toBe(score.b.n);
    expect(scoreForecasts([],["a"]).a.oneXTwoLogLoss).toBeNull();
  });
  it("paired block intervals are deterministic and identical forecasts have zero difference",()=>{
    const rows=Array.from({length:30},(_,i)=>({...row,fixtureId:i,date:`2026-09-${String(1+i%10).padStart(2,"0")}T12:00:00Z`}));
    expect(pairedForecastInterval(rows,"a","b","oneXTwo")).toEqual({days:10,delta:0,lower95:0,upper95:0});
    expect(pairedForecastInterval([row],"a","b","over")).toBeNull();
  });
});
