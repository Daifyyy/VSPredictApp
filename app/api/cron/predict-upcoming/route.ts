import { NextResponse } from "next/server";
import { runPredictUpcoming } from "@/lib/data/predictions";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { recordCoverage, withCronRun } from "@/lib/operations";

// Predikce nadcházejících zápasů (denní cron). Warm cache → levné; první studené
// naplnění radši lokálně / přes ?league=ID. Idempotentní (upsert).
//
// `maxDuration` musí být VĚTŠÍ než rozpočet `runPredictUpcoming`, aby se běh ukončil
// sám a stihl vrátit statistiku – zabití platformou je tichá ztráta informace o tom,
// kam se pipeline dostala. Soutěže se denně rotují, takže i zkrácený běh pokryje
// zbytek další dny.
//
// **60 s je strop Vercel Hobby plánu.** Vyšší hodnota se tu tvářila jako nastavená
// (bylo tu 300), ale platforma ji ignoruje – rozpočet 4 min proto nikdy nedoběhl a běh
// vždy zabil timeout. Nezvyšuj to zpátky bez Pro plánu; místo toho drž
// `DEFAULT_BUDGET_MS` pod touhle hodnotou.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isRealDataConfigured()) {
    return NextResponse.json(
      { error: "Reálná data nejsou nakonfigurována (mock režim)" },
      { status: 400 }
    );
  }
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const leagueParam = new URL(req.url).searchParams.get("league");
  // Bez parametru = celý (rotovaný) seznam soutěží; s parametrem jen ta jedna.
  const leagueIds = leagueParam ? [Number(leagueParam)] : undefined;

  try {
    const stats = await withCronRun("predict-upcoming", async () => {
      const result = await runPredictUpcoming(leagueIds);
      await recordCoverage({
        category: leagueIds?.length === 1 ? `PREDICTION_24H_${leagueIds[0]}` : "PREDICTION_24H",
        eligible: result.eligible24h,
        covered: result.ready24h,
        target: .95,
        details: { leagueIds },
      });
      return {
        ...result,
        candidates: result.fixtures,
        processed: result.predicted,
        remaining: result.stopped ? Math.max(0, result.leagues - result.covered) : 0,
        cursor: result.stopped ? String(result.covered) : null,
        reason: result.stopped ? "TIME_BUDGET" : null,
      };
    });
    return cronJson("cron/predict-upcoming", stats, stats.errors, stats.predicted);
  } catch (e) {
    logError("cron/predict-upcoming", e, { leagueIds });
    return NextResponse.json({ error: "Predikce selhala" }, { status: 502 });
  }
}
