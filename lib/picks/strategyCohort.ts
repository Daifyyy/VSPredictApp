import { MODEL_VERSION } from "../data/modelVersion";
import { MODEL_CONTEXT_VERSION, type ModelContext } from "../data/modelContext";
import { FOUL_MODEL_VERSION } from "./fouls";
import { CORNERS_LIVE_COUNT_MODEL_VERSION } from "./autonomousPortfolio";

/** One active model/context cohort, shared by monitoring, Model Lab and Strategy Hub. */
export function strategyCohort(strategy: string, context: ModelContext = "LEAGUE") {
  return {
    modelContext: context,
    modelVersion: strategy === "PRESSURE_FLOW_V5" ? 5 : MODEL_VERSION,
    contextVersion: MODEL_CONTEXT_VERSION[context],
    countModelVersion: strategy === "FOULS" ? FOUL_MODEL_VERSION
      : strategy === "CORNERS" || strategy === "CARDS_REF" ? CORNERS_LIVE_COUNT_MODEL_VERSION : null,
  };
}

/** CLV belongs to the actually recorded stake price, not another execution quote. */
export function ledgerClv(row: {
  decimalOdds: number | null; closingBenchmarkProbability: number | null;
  bookmaker: string | null; openingBookmaker: string | null; sameBookClv: boolean | null;
  probabilityClv: number | null; closingFreshness: string | null;
  closingBenchmarkQuality: string | null; clvMethodVersion: number | null;
}) {
  return {
    priceClv: row.clvMethodVersion === 2 && row.decimalOdds != null && Number.isFinite(row.decimalOdds) && row.decimalOdds > 1 && row.closingBenchmarkProbability != null && Number.isFinite(row.closingBenchmarkProbability) && row.closingBenchmarkProbability > 0 && row.closingBenchmarkProbability < 1
      ? row.decimalOdds * row.closingBenchmarkProbability - 1 : null,
    probabilityClv: row.probabilityClv,
    closingFreshness: row.closingFreshness,
    closingBenchmarkQuality: row.closingBenchmarkQuality,
    benchmarkQuality: row.closingBenchmarkQuality,
    sameBookClv: row.bookmaker != null && row.bookmaker === row.openingBookmaker && row.sameBookClv === true,
    clvMethodVersion: row.clvMethodVersion,
  };
}
