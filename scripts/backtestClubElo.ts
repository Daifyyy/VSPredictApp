import { prisma } from "../lib/db";
import { DEFAULT_ELO_CONFIG, eloMetrics, replayElo, type EloConfig } from "../lib/picks/clubElo";

async function main() {
const matches = await prisma.clubEloMatch.findMany({ orderBy: [{ kickoff: "asc" }, { fixtureId: "asc" }] });
const split = Math.floor(matches.length * .7), train = matches.slice(0, split), holdout = matches.slice(split);
const grid:EloConfig[]=[];
for(const longK of [15,20,25])for(const fastK of [40,50,60])for(const homeAdvantage of [50,70,90])for(const seasonRegression of [.1,.15,.2])for(const goalDifferenceWeight of [.2,.35,.5]) grid.push({...DEFAULT_ELO_CONFIG,longK,fastK,homeAdvantage,seasonRegression,goalDifferenceWeight});
const score=(rows:typeof matches,config:EloConfig)=>{const snapshots=replayElo(rows,config).snapshots;return eloMetrics(snapshots.map((snapshot,index)=>({probabilities:snapshot.blended,result:rows[index].homeGoals>rows[index].awayGoals?"HOME":rows[index].homeGoals<rows[index].awayGoals?"AWAY":"DRAW"} as const)))};
const ranked=grid.map(config=>({config,metrics:score(train,config)})).sort((a,b)=>a.metrics.logLoss-b.metrics.logLoss||a.metrics.ece-b.metrics.ece||a.metrics.brier-b.metrics.brier);
const best=ranked[0];
const allSnapshots=replayElo(matches,best.config).snapshots.slice(split);
const holdoutMetrics=eloMetrics(allSnapshots.map((snapshot,index)=>({probabilities:snapshot.blended,result:holdout[index].homeGoals>holdout[index].awayGoals?"HOME":holdout[index].homeGoals<holdout[index].awayGoals?"AWAY":"DRAW"} as const)));
console.log(JSON.stringify({matches:matches.length,train:train.length,holdout:holdout.length,best:{config:best.config,training:best.metrics,holdout:holdoutMetrics},note:"Rolling hold-out je chronologický. ROI není optimalizační metrika; vyhodnocuje se pouze prospektivně po strategiích."},null,2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
