import { NextResponse } from "next/server";
import { strategyLifecycle } from "@/lib/picks/strategyLifecycle";
import { getCurrentUser } from "@/lib/authUser";
import { localDateKey } from "@/lib/competitionGrouping";
import { strategyHubDailySummary, strategyHubData } from "@/lib/data/strategyHubStore";
import { getEntitlement } from "@/lib/entitlements";
import { logError } from "@/lib/logError";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { isAllowedStrategyDate, isStrategyHubId, STRATEGY_HUB_CATALOG, type StrategyHubId } from "@/lib/picks/strategyHub";
import { isOverCohort, OVER_COHORTS, overCohortDefinition } from "@/lib/picks/overCohorts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`strategy-hub:${clientKey(request)}`, 60, 60_000)) return tooMany();
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? localDateKey(new Date());
  const strategy = url.searchParams.get("strategy") ?? "VALUE";
  const summary = url.searchParams.get("summary") === "1";
  const variant = url.searchParams.get("cohort") ?? "current";
  if (!isOverCohort(variant) || (variant !== "current" && (strategy !== "OVER_25" || summary))) return NextResponse.json({ error: "Neplatná kohorta strategie." }, { status: 400 });
  if (!isAllowedStrategyDate(date, localDateKey(new Date())) || (!summary && !isStrategyHubId(strategy))) return NextResponse.json({ error: "Neplatná strategie nebo datum." }, { status: 400 });

  const user = await getCurrentUser();
  const pro = getEntitlement(user).pro;
  const catalog = STRATEGY_HUB_CATALOG.map((item) => ({ ...item, statusLabel: item.id === "VALUE" || item.id === "ELO_INTUITION" ? "Experiment" : item.status === "LIVE_TEST" ? "Sledovaná strategie · neověřená" : item.status === "NO_MARKET" ? "Bez sázkového trhu" : "Výzkum" }));
  const cohort = strategy === "OVER_25" ? overCohortDefinition(variant) : null;
  for (const item of catalog) {
    const lifecycle = strategyLifecycle(item.id);
    if (lifecycle.state === "PAUSED") {
      item.statusLabel = "Pozastavený sběr";
      item.description += " Nové výběry se nevytvářejí. Historie a vyhodnocení zůstávají zachované.";
    }
    if (lifecycle.state === "QUARANTINED") item.statusLabel = "Datová karanténa";
  }
  const metadata = { date, strategy, catalog, cohort, cohorts: strategy === "OVER_25" ? OVER_COHORTS : [] };
  if (!pro) return NextResponse.json({ ...metadata, locked: true }, { headers: { "Cache-Control": "private, no-store" } });

  try {
    if (summary) return NextResponse.json({ date, catalog, locked: false, summary: await strategyHubDailySummary(date) }, { headers: { "Cache-Control": "private, no-store" } });
    const data = variant === "current" ? await strategyHubData(strategy as StrategyHubId, date) : await strategyHubData(strategy as StrategyHubId, date, variant);
    return NextResponse.json({ ...metadata, locked: false, data,
      asOf: 'asOf' in data ? data.asOf : new Date().toISOString(),
      stale: 'stale' in data ? data.stale : false,
      limitedReason: 'limitedReason' in data ? data.limitedReason : null,
    }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } });
  } catch (error) {
    if (error instanceof Error && error.message === 'STRATEGY_METRICS_NOT_CAPTURED') {
      return NextResponse.json({ ...metadata, locked: false, error: 'Historický souhrn dosud není připraven. Je potřeba běh auditu strategií; nejde o nulovou bilanci.', asOf: null, stale: true, limitedReason: error.message },
        { status: 503, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '900' } });
    }
    logError("api/picks/strategies", error, { date, strategy, summary });
    return NextResponse.json({ error: "Přehled strategií se nepodařilo načíst." }, { status: 502 });
  }
}
