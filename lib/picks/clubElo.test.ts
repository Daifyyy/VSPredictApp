import { describe, expect, it } from "vitest";
import { DEFAULT_ELO_CONFIG, eloProbabilities, replayElo, type EloMatch } from "./clubElo";

const match = (fixtureId:number, day:number, homeGoals:number, awayGoals:number, homeTeamId=1, awayTeamId=2, season=2026):EloMatch => ({ fixtureId, leagueId:39, season, kickoff:new Date(Date.UTC(2026,7,day)), homeTeamId, awayTeamId, homeGoals, awayGoals });

describe("club Elo",()=>{
  it("započítává domácí výhodu a pravděpodobnosti normalizuje",()=>{const p=eloProbabilities(1500,1500,70);expect(p.home).toBeGreaterThan(p.away);expect(p.home+p.draw+p.away).toBeCloseTo(1)});
  it("výhra posune vítěze nahoru a remíza proti slabšímu jej neposílí",()=>{const replay=replayElo([match(1,1,2,0),match(2,2,1,1)]);expect(replay.snapshots[1].home.long).toBeGreaterThan(1500);expect(replay.states.get(1)!.long).toBeLessThan(replay.snapshots[1].home.long)});
  it("vyšší rozdíl skóre zesiluje aktualizaci",()=>{const narrow=replayElo([match(1,1,1,0)]).states.get(1)!.long;const wide=replayElo([match(1,1,5,0)]).states.get(1)!.long;expect(wide).toBeGreaterThan(narrow)});
  it("FAST reaguje rychleji než LONG",()=>{const state=replayElo([match(1,1,3,0)]).states.get(1)!;expect(state.fast-1500).toBeGreaterThan(state.long-1500)});
  it("sezonní regrese vrací LONG k ligovému průměru",()=>{const first=replayElo([match(1,1,4,0)]).states.get(1)!.long;const r=replayElo([match(1,1,4,0),{...match(2,2,0,0),season:2027,kickoff:new Date(Date.UTC(2027,7,2))}]);expect(Math.abs(r.snapshots[1].home.long-1500)).toBeLessThan(Math.abs(first-1500))});
  it("replay je deterministický bez ohledu na pořadí vstupu",()=>{const rows=[match(2,2,0,1),match(1,1,2,0)];expect(replayElo(rows).states).toEqual(replayElo([...rows].reverse()).states)});
  it("nováček začíná na průměru ligy s nulovou confidence",()=>{const r=replayElo([match(1,1,1,0),match(2,2,1,0,3,1)]);expect(r.snapshots[1].home.longSample).toBe(0);expect(r.snapshots[1].home.fastSample).toBe(0)});
  it("evropský zápas přenese sílu mezi týmy bez zvláštního přepínače",()=>{const r=replayElo([{...match(1,1,3,0),leagueId:2}]);expect(r.states.get(1)!.long).toBeGreaterThan(DEFAULT_ELO_CONFIG.initial);expect(r.states.get(2)!.long).toBeLessThan(DEFAULT_ELO_CONFIG.initial)});
});
