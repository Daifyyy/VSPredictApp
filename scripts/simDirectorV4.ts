import { simulateMatch } from "../lib/game/simulate";
import { phaseMatchup, type SportingPlan } from "../lib/director/sporting";
import { seeded } from "../lib/director/random";

const rand = seeded(4_202_608); const count = Number(process.argv[2] ?? 100_000);
let goals = 0, homeWins = 0, draws = 0, awayWins = 0, homeXg = 0, awayXg = 0;
const plan = (offset: number): SportingPlan => ({ formation: "4-3-3", mentality: "BALANCED", lineup: [], bench: [], reasons: [], weaknesses: [], confidence: .75, phases: { BUILDUP: 42 + rand() * 32 + offset, PRESSING: 42 + rand() * 32, TRANSITION: 42 + rand() * 32, BLOCK: 42 + rand() * 32, SET_PIECES: 42 + rand() * 32, DISCIPLINE: 42 + rand() * 32 } });
for (let i = 0; i < count; i++) {
  const home = { id: i * 2, name: "Home", short: "H", color: "#111", attack: .9 + rand() * .9, defense: .75 + rand() * .9, homeBoost: 1.12 };
  const away = { id: i * 2 + 1, name: "Away", short: "A", color: "#222", attack: .9 + rand() * .9, defense: .75 + rand() * .9, homeBoost: 1.12 };
  const duel = phaseMatchup(plan(2), plan(0)); const homeAdj = { attack: duel.homeAttack, concede: duel.awayAttack }; const awayAdj = { attack: duel.awayAttack, concede: duel.homeAttack };
  const result = simulateMatch(home, away, homeAdj, awayAdj, rand); goals += result.homeGoals + result.awayGoals; homeWins += Number(result.homeGoals > result.awayGoals); draws += Number(result.homeGoals === result.awayGoals); awayWins += Number(result.homeGoals < result.awayGoals);
  homeXg += home.attack * homeAdj.attack; awayXg += away.attack * awayAdj.attack;
}
console.log(JSON.stringify({ matches: count, goalsPerMatch: goals / count, homeWinPct: homeWins / count * 100, drawPct: draws / count * 100, awayWinPct: awayWins / count * 100, relativeHomeAttack: homeXg / count, relativeAwayAttack: awayXg / count }, null, 2));
