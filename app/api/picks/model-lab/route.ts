import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { publicCache } from "@/lib/cacheHeaders";
import { STRATEGY_CATALOG, modelLabSegments, modelLabSummary, resolveModelLabStatus, type ModelLabContext } from "@/lib/picks/modelLab";
import { requestDiagnostics } from "@/lib/httpDiagnostics";
import { strategyCohort } from "@/lib/picks/strategyCohort";
import { loadModelStrategyLedger, MODEL_LAB_REPORT_VERSION } from "@/lib/data/modelStrategyLedger";
import { PRESSURE_PERFORMANCE_CACHE_KEY } from "@/lib/data/pressurePerformanceStore";

const querySchema = z.object({
  context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE"),
  strategy: z.string().max(40).optional(),
  policyVersion: z.coerce.number().int().positive().optional(),
  detail: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
});
export const dynamic = "force-dynamic";

/** Summary requests only read cached accounting; refresh is owned by settlement monitoring. */
async function cachedSummary(context: ModelLabContext) {
  const [snapshots, definitions, pressure] = await Promise.all([
    prisma.modelStrategyMetricSnapshot.findMany({
      where: { modelContext: context, OR: STRATEGY_CATALOG.map(item => ({ strategy: item.strategy, policyVersion: item.policyVersion, modelVersion: strategyCohort(item.strategy, context).modelVersion })) },
      orderBy: { createdAt: "desc" }, take: STRATEGY_CATALOG.length * 4,
    }),
    prisma.modelStrategyDefinition.findMany({ where: { modelContext: context } }),
    prisma.apiCache.findUnique({ where: { key: PRESSURE_PERFORMANCE_CACHE_KEY } }),
  ]);
  const cards = STRATEGY_CATALOG.map(item => {
    const cohort = strategyCohort(item.strategy, context);
    const stored = snapshots.find(row => row.strategy === item.strategy && row.policyVersion === item.policyVersion && row.modelVersion === cohort.modelVersion && (row.metrics as { reportVersion?: number } | null)?.reportVersion === MODEL_LAB_REPORT_VERSION);
    const override = definitions.find(row => row.strategy === item.strategy && row.policyVersion === item.policyVersion && row.modelVersion === cohort.modelVersion);
    return { ...(stored?.metrics as Record<string, unknown> ?? { summary: modelLabSummary([]), currentCount: 0 }), ...item,
      ...cohort, status: resolveModelLabStatus(item, override?.status),
      asOf: stored?.createdAt.toISOString() ?? null, awaitingRefresh: !stored,
    };
  });
  return { cards, pressurePerformance: pressure?.payload ?? null };
}

export async function GET(request: Request) {
  const diagnostic = requestDiagnostics(request);
  if (!allowRequest(`model-lab:${clientKey(request)}`, 40, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný filtr" }, { status: 400 });
  if (parsed.data.detail) {
    const user = await getCurrentUser();
    if (!getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
  }
  try {
    const { context, strategy, policyVersion, detail } = parsed.data;
    const payload = await cachedSummary(context);
    const cards = payload.cards.filter(item => (!strategy || item.strategy === strategy) && (!policyVersion || item.policyVersion === policyVersion));
    if (!detail) return diagnostic.json({ context, ...payload, cards, snapshot: true }, { headers: publicCache(300, 900) });
    const { ledger } = await loadModelStrategyLedger(context, strategy);
    const rows = ledger.filter(row => !policyVersion || row.policyVersion === policyVersion);
    const detailRows = rows.slice(-100).reverse().map(row => ({
      id: row.id, fixtureId: row.fixtureId, kickoff: row.kickoff, strategy: row.strategy, policyVersion: row.policyVersion,
      market: row.market, side: row.side, line: row.line, modelProbability: row.modelProbability,
      marketProbability: row.marketProbability, decimalOdds: row.decimalOdds, qualifiedAt: row.qualifiedAt,
      homeGoals: row.homeGoals, awayGoals: row.awayGoals, actualCount: row.actualCount, storedHit: row.storedHit,
      priceClv: row.priceClv, dataWarning: row.dataWarning,
    }));
    return diagnostic.json({ context, cards, detailRows, segments: strategy && policyVersion ? modelLabSegments(rows) : [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/picks/model-lab", error);
    return NextResponse.json({ error: "Přehled se nepodařilo načíst" }, { status: 502 });
  }
}
