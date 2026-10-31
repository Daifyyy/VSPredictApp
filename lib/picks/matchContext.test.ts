import { expect, it } from 'vitest';
import type { MatchStat, Team } from '../types';
import { freezeMatchContext, teamMatchContext, type MatchContextSnapshot } from './matchContext';
const kickoff = '2026-10-31T18:00:00Z', captured = '2026-10-31T08:00:00Z';
const row = (id: number, date = '2026-10-20T18:00:00Z', extra: Partial<MatchStat> = {}): MatchStat => ({ fixtureId:id,date,isHome:true,isNeutral:false,competitive:true,season:2026,isBaseline:false,metrics:{GOALS_FOR:0,GOALS_AGAINST:1,SHOTS:10},...extra });
const team = (rows: MatchStat[]): Team => ({ id:1,name:'Home',logoUrl:'',country:'CZ',entityType:'CLUB',leagueId:345,leagueMatches:rows });
it('excludes future, friendly, invalid and not-yet-available results; deduplicates both sources', () => {
  const input=team([row(1),row(2,kickoff),row(3,captured),row(4,'2026-10-31T05:00:00Z'),row(5,'invalid'),row(6,undefined,{competitive:false}),row(7,undefined,{metrics:{SHOTS:10}})]);
  input.euroMatches=[row(1)];
  const result=teamMatchContext(input,kickoff,captured,true);
  expect(result.sample).toBe(1); expect(result.overall.metrics.GOALS_FOR.value).toBe(0);
  expect(result.overall.metrics.XG).toEqual({value:null,sample:0});
});
it('bounds history and venue windows independently and produces compact output', () => {
  const input=team(Array.from({length:100},(_,i)=>row(i,new Date(Date.parse(captured)-(i+1)*86400_000).toISOString(),{isHome:i%2===0})));
  const result=teamMatchContext(input,kickoff,captured,false);
  expect(result.sample).toBe(10); expect(result.venue.sample).toBe(10); expect(result.recent).toHaveLength(5);
  expect(JSON.stringify(result).length).toBeLessThan(8000);
});
it('does not infer coach continuity through missing observations or future collection', () => {
  const tactical={formation:'4-3-3',coachId:1,coachName:'Coach',observedAt:'2026-10-25T00:00:00Z'};
  const input=team([row(1,'2026-10-24T00:00:00Z',{tactical}),row(2,'2026-10-23T00:00:00Z'),row(3,'2026-10-22T00:00:00Z',{tactical})]);
  expect(teamMatchContext(input,kickoff,captured,true).tactics.coach).toEqual({name:'Coach',observed:2,comparable:2,consecutive:1});
  input.leagueMatches[0].tactical={...tactical,observedAt:'2026-11-01T00:00:00Z'};
  expect(teamMatchContext(input,kickoff,captured,true).tactics.coach).toBeNull();
});
it('uses coach identity rather than identical names and excludes neutral venue rows', () => {
  const tactical={formation:'4-4-2',coachId:1,coachName:'Coach',observedAt:captured};
  const input=team([row(1,'2026-10-24',{tactical,isNeutral:true}),row(2,'2026-10-23',{tactical:{...tactical,coachId:2}})]);
  const result=teamMatchContext(input,kickoff,captured,true);
  expect(result.tactics.coach?.observed).toBe(1); expect(result.venue.sample).toBe(1);
});
it('preserves first capture and rejects post-kickoff, future and invalid timestamps', () => {
  const incoming={capturedAt:captured,kickoff} as MatchContextSnapshot;
  const now=new Date(captured);
  expect(freezeMatchContext(null,incoming,now)).toBe(incoming);
  expect(freezeMatchContext(incoming,{...incoming,capturedAt:'2026-10-31T09:00:00Z'},now)).toBe(incoming);
  expect(freezeMatchContext(null,incoming,new Date(kickoff))).toBeUndefined();
  expect(freezeMatchContext(null,{...incoming,kickoff:'invalid'},now)).toBeUndefined();
  expect(freezeMatchContext(null,{...incoming,capturedAt:kickoff},now)).toBeUndefined();
});
