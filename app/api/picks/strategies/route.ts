import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { localDateKey } from "@/lib/competitionGrouping";
import { strategyHubDailySummary, strategyHubData } from "@/lib/data/strategyHubStore";
import { getEntitlement } from "@/lib/entitlements";
import { logError } from "@/lib/logError";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { isAllowedStrategyDate, isStrategyHubId, STRATEGY_HUB_CATALOG, type StrategyHubId } from "@/lib/picks/strategyHub";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`strategy-hub:${clientKey(request)}`, 60, 60_000)) return tooMany();
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? localDateKey(new Date());
  const strategy = url.searchParams.get("strategy") ?? "VALUE";
  const summary = url.searchParams.get("summary") === "1";
  if (!isAllowedStrategyDate(date, localDateKey(new Date())) || (!summary && !isStrategyHubId(strategy))) return NextResponse.json({ error: "Neplatná strategie nebo datum." }, { status: 400 });

  const user = await getCurrentUser();
  const pro = getEntitlement(user).pro;
  const catalog = STRATEGY_HUB_CATALOG.map((item) => ({ ...item, statusLabel: item.status === "LIVE_TEST" ? "Ostrý test" : item.status === "NO_MARKET" ? "Bez sázkového trhu" : "Výzkum" }));
  if (!pro) return NextResponse.json({ date, strategy, catalog, locked: true }, { headers: { "Cache-Control": "private, no-store" } });

  try {
    if (summary) return NextResponse.json({ date, catalog, locked: false, summary: await strategyHubDailySummary(date) }, { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ date, strategy, catalog, locked: false, data: await strategyHubData(strategy as StrategyHubId, date) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/picks/strategies", error, { date, strategy, summary });
    return NextResponse.json({ error: "Přehled strategií se nepodařilo načíst." }, { status: 502 });
  }
}
