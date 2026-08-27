import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";
import { auditPipeline, withCronRun } from "@/lib/operations";
import { runPredictUpcoming, runSettleResults, runSnapshotOdds } from "@/lib/data/predictions";

export const maxDuration = 60;

async function admin() {
  const user = await getCurrentUser();
  return Boolean(user?.email && isAdminEmail(user.email));
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Zakázáno" }, { status: 403 });
  return NextResponse.json(await auditPipeline());
}

export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Zakázáno" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { job?: string; leagueId?: number; limit?: number };
  if (body.job === "predict-upcoming") return NextResponse.json(await withCronRun("predict-upcoming:retry", async () => {
    const result = await runPredictUpcoming(body.leagueId ? [body.leagueId] : undefined);
    return { ...result, candidates: result.fixtures, processed: result.predicted, remaining: result.stopped ? result.leagues - result.covered : 0 };
  }));
  if (body.job === "snapshot-odds") return NextResponse.json(await withCronRun("snapshot-odds:retry", async () => {
    const result = await runSnapshotOdds(Math.min(80, Math.max(1, body.limit ?? 40)));
    return { ...result, candidates: result.due + result.remaining, processed: result.open + result.close + result.series };
  }));
  if (body.job === "settle-results") return NextResponse.json(await withCronRun("settle-results:retry", async () => {
    const result = await runSettleResults();
    return { ...result, candidates: result.pending, processed: result.settled, remaining: result.pending - result.settled };
  }));
  return NextResponse.json({ error: "Neplatná úloha" }, { status: 400 });
}
