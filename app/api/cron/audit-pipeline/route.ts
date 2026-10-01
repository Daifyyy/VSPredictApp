import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { auditPipeline, withCronRun } from "@/lib/operations";
import { logError } from "@/lib/logError";
import { monitorModelLab } from "@/lib/data/modelLabMonitoring";
import { reconcileQuickOverviewSettlements } from "@/lib/data/quickOverviewStore";
import { captureModelEvaluationSnapshots } from "@/lib/data/modelEvaluationStore";
import { refreshStrategyHubMetrics } from "@/lib/data/strategyHubStore";
import { refreshQuickPerformance } from "@/lib/data/quickPerformanceStore";
import { refreshLegacyStats } from "@/lib/data/legacyStatsStore";

export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = await requireCronAuth(req);
  if (denied) return denied;
  try {
    const result = await withCronRun("audit-pipeline", async () => {
      const startedAt = Date.now();
      const health = await auditPipeline();
      // Opt-in only after measuring runtime headroom; no new workflow or request.
      const repairedQuickSettlements = await reconcileQuickOverviewSettlements();
      if (process.env.RESOURCE_SAVING_READS_ENABLED === 'true') {
        await refreshStrategyHubMetrics();
        await refreshQuickPerformance();
      }
      const modelLab = await monitorModelLab();
      const modelEvaluation = await captureModelEvaluationSnapshots();
      // Optional historical diagnostics must not be added to an already exhausted run.
      const legacyStats = process.env.RESOURCE_LEGACY_STATS_REFRESH_ENABLED !== 'true' ? { status: 'DISABLED' }
        : Date.now() - startedAt > 40_000 ? { status: 'DEFERRED', reason: 'AUDIT_TIME_BUDGET' }
        : await refreshLegacyStats();
      return {
        ...health,
        modelLab,
        modelEvaluation,
        legacyStats,
        repairedQuickSettlements,
        candidates: health.coverage.reduce((sum, row) => sum + row.eligible, 0),
        processed: health.coverage.reduce((sum, row) => sum + row.covered, 0),
        // NalezenĂ˝ incident nenĂ­ chyba samotnĂ©ho auditu. Jinak audit vytvĂˇĹ™Ă­
        // rekurzivnĂ­ faleĹˇnĂ˝ poplach pokaĹľdĂ©, kdy korektnÄ› odhalĂ­ problĂ©m jinde.
        errors: 0,
        findings: health.incidents.length + modelLab.findings,
        remaining: health.overdue,
      };
    });
    return NextResponse.json({ ok: result.errors === 0, ...result }, { status: result.processed === 0 && result.errors > 0 ? 502 : 200 });
  } catch (error) {
    logError("cron/audit-pipeline", error);
    return NextResponse.json({ error: "Audit pipeline selhal" }, { status: 502 });
  }
}
