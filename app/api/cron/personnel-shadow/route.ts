import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { isRealDataConfigured } from "@/lib/db";
import { logError } from "@/lib/logError";
import { withCronRun } from "@/lib/operations";
import { collectPersonnelShadow, refreshCoverage } from "@/lib/data/personnelShadow";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isRealDataConfigured()) return NextResponse.json({ error: "Mock režim" }, { status: 400 });
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(8, Number(params.get("limit")) || 4));
  const cursor = Math.max(0, Number(params.get("cursor")) || 0);
  try {
    const result = await withCronRun("personnel-shadow", async () => {
      const coverage = await refreshCoverage();
      const collection = await collectPersonnelShadow({ limit, cursor });
      return { ...collection, coverage, apiCalls: 0 };
    });
    return cronJson("cron/personnel-shadow", result, result.errors, result.processed);
  } catch (error) {
    logError("cron/personnel-shadow", error);
    return NextResponse.json({ error: "Sběr sestav a dostupnosti selhal" }, { status: 502 });
  }
}
