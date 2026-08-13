import { getSettledPredictions } from "../lib/data/predictionStore.ts";
import { MODEL_VERSION } from "../lib/data/modelVersion.ts";
import {
  MODEL_CONTEXT_VERSION,
  isCurrentContextVersion,
  modelContextForLeague,
  type ModelContext,
} from "../lib/data/modelContext.ts";

async function main() {
  const rows = await getSettledPredictions(MODEL_VERSION);
  const contexts: ModelContext[] = ["LEAGUE", "EURO_CUP", "NATIONAL"];
  console.log(`Audit modelVersion=${MODEL_VERSION}`);
  for (const context of contexts) {
    const group = rows.filter((row) => modelContextForLeague(row.leagueId) === context);
    const current = group.filter(isCurrentContextVersion);
    const countReady = current.filter(
      (row) => row.lambdaCornersHome != null && row.lambdaCardsHome != null
    );
    console.log(
      `${context}: aktuální v${MODEL_CONTEXT_VERSION[context]} = ${current.length}, ` +
      `legacy = ${group.length - current.length}, rohy+karty = ${countReady.length}`
    );
  }
  console.log("LEAGUE v1 zůstává použitelný; EURO_CUP v1 je pouze historický auditní vzorek.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
