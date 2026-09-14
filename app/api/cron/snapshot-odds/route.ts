import { NextResponse } from "next/server";
import { runSnapshotOdds } from "@/lib/data/predictions";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { acquireOddsCronLease, releaseOddsCronLease, resolveIncident, safeApiBudget, safeOddsApiBudget, upsertIncident, withCronRun } from "@/lib/operations";
import { allowedOddsFixtures } from "@/lib/picks/oddsCronPolicy";

// Snímky kurzů pro CLV: otevírací, zavírací a body ČASOVÉ ŘADY. Běží **hodinově**,
// na rozdíl od ostatních cronů – a je to nutnost, ne ladění:
//
// Predikční cron jede 1×/den ve 04:30 UTC. Zavírací okno je 3 h před výkopem, takže
// večerní zápas (21:45 SELČ = 19:45 UTC) je v 04:30 daleko mimo okno a další běh by
// přišel až po výkopu. Zavírací snímek by tedy dostávaly jen zápasy s výkopem dopoledne
// a CLV by se počítalo z vychýlené menšiny.
//
// Otevírací a zavírací snímek zůstávají **jeden za život** (guard v DB). Navíc přibývá
// časová řada s kadencí, která se zužuje k výkopu (12 h → 3 h → 1 h) – ta stojí ~340
// volání/den a je to jediná položka, která proti dřívějšku kvótu zdražila. Výběr zápasů
// je čistě DB dotaz; co se s nimi stane, rozhoduje čistá `snapshotPlan`.
//
// 60 s = strop Vercel Hobby plánu (vyšší hodnota se ignoruje). Proto je i default
// `SNAPSHOT_LIMIT` malý – radši víc krátkých běhů než jeden zabitý timeoutem.
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

  // `?limit=` jen pro ruční doplnění po výpadku; default drží běh krátký.
  const searchParams = new URL(req.url).searchParams;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const seenFixtureIds = (searchParams.get("cursor") ?? "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 100);
  const mode = searchParams.get("mode") === "priority" ? "priority" : "full";
  if (mode === "priority" && process.env.CLV_V2_PRIORITY_ENABLED !== "true") {
    return NextResponse.json({ ok: true, mode, processed: 0, reason: "CLV_V2_SHADOW_DISABLED" });
  }

  try {
    const stats = await withCronRun(mode === "priority" ? "snapshot-odds-priority" : "snapshot-odds", async () => {
      const lease = await acquireOddsCronLease(mode);
      if (!lease) return { due: 0, open: 0, close: 0, series: 0, empty: 0, errors: 0, withBooks: 0, coverage: {}, missingMarkets: [], checklistCandidates: 0, checklistNotifications: 0, autonomousCandidates: 0, remaining: 0, processedFixtureIds: [], failed: [], candidates: 0, processed: 0, deferred: 0, cursor: null, reason: "LEASE_HELD" };
      try {
      const budget = await safeApiBudget();
      const oddsBudget = await safeOddsApiBudget();
      if (oddsBudget.warned) await upsertIncident({ fingerprint: "odds-api:daily-warning", kind: "API_BUDGET", severity: "WARNING", message: `Kurzový sběr dnes použil ${oddsBudget.apiCalls}/${oddsBudget.ceiling} API pokusů.`, details: oddsBudget });
      else await resolveIncident("odds-api:daily-warning");
      const requested = mode === "priority" ? 12 : Number.isFinite(limit) && limit! > 0 ? Math.min(24, limit!) : 12;
      // Jeden logický fetch může mít až dva retry; rezervujeme proto tři skutečné pokusy,
      // aby ani nejhorší transientní série nepřekročila kurzový hard limit.
      const allowed = allowedOddsFixtures({ requested, globalRemaining: budget.remaining, oddsRemaining: oddsBudget.remaining });
      const result = await runSnapshotOdds(allowed, undefined, seenFixtureIds, mode);
      if (allowed === 0) return { ...result, candidates: result.remaining, processed: 0, remaining: 0, deferred: result.remaining, cursor: null, reason: budget.remaining === 0 ? "DAILY_BUDGET" : "ODDS_DAILY_BUDGET", quota: budget, oddsQuota: oddsBudget };
      const nextCursor = [...new Set([...seenFixtureIds, ...result.processedFixtureIds])].join(",");
      return {
        ...result,
        candidates: result.due + result.remaining,
        processed: result.open + result.close + result.series,
        cursor: result.remaining > 0 ? nextCursor : null,
        reason: result.remaining > 0 ? "BATCH_LIMIT" : null,
        quota: budget,
        oddsQuota: oddsBudget,
        mode,
      };
      } finally {
        await releaseOddsCronLease(lease);
      }
    });
    // „Zvládnuto" = uložený snímek jakéhokoli druhu. `empty` (kniha zápas nekótuje)
    // se nepočítá ani do chyb, ani do úspěchů – to je legitimní prázdná odpověď.
    return cronJson(
      "cron/snapshot-odds",
      stats,
      stats.errors,
      stats.open + stats.close + stats.series
    );
  } catch (e) {
    logError("cron/snapshot-odds", e);
    return NextResponse.json({ error: "Snímek kurzů selhal" }, { status: 502 });
  }
}
