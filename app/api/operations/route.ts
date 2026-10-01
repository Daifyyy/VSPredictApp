import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";
import { auditPipeline, withCronRun } from "@/lib/operations";
import { readOperationsReport } from "@/lib/data/operationsReport";
import { resourceBudgetGuard } from "@/lib/resourceBudgetGuard";
import { refreshStrategyHubMetrics } from "@/lib/data/strategyHubStore";
import { refreshPressurePerformance } from "@/lib/data/pressurePerformanceStore";
import { refreshQuickPerformance } from "@/lib/data/quickPerformanceStore";
import { monitorModelLab } from "@/lib/data/modelLabMonitoring";
import { refreshLegacyStats } from "@/lib/data/legacyStatsStore";
import { refreshLivePerformance } from "@/lib/data/livePerformanceStore";
import { runPredictUpcoming, runSettleResults, runSnapshotOdds } from "@/lib/data/predictions";

export const maxDuration = 60;

async function admin() {
  const user = await getCurrentUser();
  return Boolean(user?.email && isAdminEmail(user.email));
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Zakázáno" }, { status: 403 });
  const result = await readOperationsReport();
  return NextResponse.json({ ...result.report, asOf: result.asOf, stale: result.stale, limitedReason: result.limitedReason }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Zakázáno" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { job?: string; leagueId?: number; limit?: number };
  const limited = await resourceBudgetGuard(body.job ?? 'unknown');
  if (limited) return limited;
  if (body.job === 'refresh-live-performance') return NextResponse.json(await refreshLivePerformance());
  if (body.job === 'refresh-legacy-stats') return NextResponse.json(await refreshLegacyStats());
  if (body.job === 'refresh-model-lab') return NextResponse.json(await monitorModelLab({ prepareDetails: true }));
  if (body.job === 'refresh-pressure-performance') return NextResponse.json(await refreshPressurePerformance());
  if (body.job === 'refresh-strategy-metrics') { await refreshStrategyHubMetrics(); await refreshQuickPerformance(); return NextResponse.json({ processed: 1 }); }
  if (body.job === 'audit-pipeline') return NextResponse.json(await auditPipeline());
  if (body.job === "predict-upcoming") return NextResponse.json(await withCronRun("predict-upcoming:retry", async () => {
    const result = await runPredictUpcoming(body.leagueId ? [body.leagueId] : undefined);
    return { ...result, candidates: result.fixtures, processed: result.predicted, remaining: result.stopped ? result.leagues - result.covered : 0 };
  }));
  if (body.job === "snapshot-odds") return NextResponse.json(await withCronRun("snapshot-odds:retry", async () => {
    const result = await runSnapshotOdds(Math.min(12, Math.max(1, body.limit ?? 12)));
    return { ...result, candidates: result.due + result.remaining, processed: result.open + result.close + result.series };
  }));
  if (body.job === "settle-results") return NextResponse.json(await withCronRun("settle-results:retry", async () => {
    const result = await runSettleResults();
    const processed = result.settled + result.statusUpdated;
    return { ...result, candidates: result.pending, processed, remaining: Math.max(0, result.pending - processed) };
  }));
  return NextResponse.json({ error: "Neplatná úloha" }, { status: 400 });
}
