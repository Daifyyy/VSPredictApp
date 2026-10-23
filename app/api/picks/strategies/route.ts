import { NextResponse } from "next/server";
import { strategyLifecycle } from "@/lib/picks/strategyLifecycle";
import { getCurrentUser } from "@/lib/authUser";
import { localDateKey } from "@/lib/competitionGrouping";
import { strategyHubDailySummary, strategyHubData } from "@/lib/data/strategyHubStore";
import { getEntitlement } from "@/lib/entitlements";
import { logError } from "@/lib/logError";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { isAllowedStrategyDate, isStrategyHubId, STRATEGY_HUB_CATALOG, type StrategyHubId } from "@/lib/picks/strategyHub";
import { activeStrategySource, defaultStrategyCohort, isOverCohort, OVER_COHORTS, overCohortDefinition } from "@/lib/picks/overCohorts";
import { loadOneXTwoDailyForecasts } from "@/lib/data/oneXTwoDailyProjection";
import { loadOneXTwoEvaluation } from "@/lib/data/oneXTwoEvaluationStore";
import { aiFlags } from '@/lib/picks/aiResearch';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`strategy-hub:${clientKey(request)}`, 60, 60_000)) return tooMany();
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? localDateKey(new Date());
  const strategy = url.searchParams.get("strategy") ?? "VALUE";
  const summary = url.searchParams.get("summary") === "1";
  const variant = url.searchParams.get("cohort") ?? (summary ? "current" : defaultStrategyCohort(strategy));
  if (!isOverCohort(variant) || (variant !== "current" && (strategy !== "OVER_25" || summary))) return NextResponse.json({ error: "Neplatná kohorta strategie." }, { status: 400 });
  if (!isAllowedStrategyDate(date, localDateKey(new Date())) || (!summary && !isStrategyHubId(strategy))) return NextResponse.json({ error: "Neplatná strategie nebo datum." }, { status: 400 });

  const user = await getCurrentUser();
  const pro = getEntitlement(user).pro;
  const catalog = STRATEGY_HUB_CATALOG.map((item) => ({ ...item, statusLabel: item.id === "VALUE" || item.id === "ELO_INTUITION" ? "Experiment" : item.status === "LIVE_TEST" ? "Sledovaná strategie · neověřená" : item.status === "NO_MARKET" ? "Bez sázkového trhu" : "Výzkum" }));
  const cohort = strategy === "OVER_25" ? overCohortDefinition(variant) : null;
  for (const item of catalog) {
    const lifecycle = strategyLifecycle(activeStrategySource(item.id));
    if (lifecycle.state === "PAUSED") {
      item.statusLabel = "Pozastavený sběr";
      item.description += " Nové výběry se nevytvářejí. Historie a vyhodnocení zůstávají zachované.";
    }
    if (lifecycle.state === "QUARANTINED") item.statusLabel = "Datová karanténa";
  }
  const metadata = { date, strategy, catalog, cohort, cohorts: strategy === "OVER_25" ? OVER_COHORTS : [] };
  if (!pro) return NextResponse.json({ ...metadata, locked: true }, { headers: { "Cache-Control": "private, no-store" } });

  try {
    if (url.searchParams.get('research') === 'ai') {
      if (strategy !== 'OVER_25' || !aiFlags().ui) return NextResponse.json({ ...metadata, locked: false, ai: null, limitedReason: 'AI_UI_DISABLED' }, { headers: { 'Cache-Control': 'private, no-store' } });
      const { readAIResearchDay } = await import('@/lib/data/aiResearchStore');
      const ai = await readAIResearchDay(date);
      const age = Date.now() - Date.parse(ai?.asOf ?? '');
      const stale = !ai || !Number.isFinite(age) || age < 0 || age > 90 * 60_000;
      return NextResponse.json({ ...metadata, locked: false, ai, asOf: ai?.asOf ?? null, stale, limitedReason: !ai ? 'AI_NOT_CAPTURED' : stale ? 'AI_STALE' : null }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (summary) return NextResponse.json({ date, catalog, locked: false, summary: await strategyHubDailySummary(date) }, { headers: { "Cache-Control": "private, no-store" } });
    const baseData = await strategyHubData(strategy as StrategyHubId, date, variant).catch((error: unknown) => {
      if (strategy !== "ONE_X_TWO" || !(error instanceof Error) || error.message !== "STRATEGY_METRICS_NOT_CAPTURED") throw error;
      // Missing accounting must not hide a separately frozen daily forecast or masquerade as zero profit.
      return { opportunities: [], tickets: [], metrics: null, coverage: { candidates: 0, priced: 0, tickets: 0 },
        emptyReason: "ONE_X_TWO_RESEARCH_ONLY", asOf: null, stale: true, limitedReason: error.message };
    });
    const data = strategy === "ONE_X_TWO" ? { ...baseData, ...await loadOneXTwoDailyForecasts(date),
      outcomeEvaluation: await loadOneXTwoEvaluation().catch(error => { logError('one-x-two-evaluation-read', error); return null; }) } : baseData;
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
