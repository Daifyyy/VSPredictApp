import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { logError } from "@/lib/logError";
import { withCronRun } from "@/lib/operations";
import { runAutomaticCalibration } from "@/lib/data/automaticCalibration";
import type { ModelContext } from "@/lib/data/modelContext";

export const maxDuration = 60;
const CONTEXTS = new Set<ModelContext>(["LEAGUE", "EURO_CUP", "NATIONAL"]);

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const value = new URL(req.url).searchParams.get("context") ?? "LEAGUE";
  if (!CONTEXTS.has(value as ModelContext)) return NextResponse.json({ error: "Neplatný modelový kontext" }, { status: 400 });
  const context = value as ModelContext;
  try {
    const result = await withCronRun(`calibrate-models:${context}`, async () => {
      const calibration = await runAutomaticCalibration(context);
      return {
        ...calibration,
        candidates: calibration.eligible,
        processed: calibration.ran ? calibration.definitions.length : 0,
        errors: 0,
        remaining: calibration.pending,
        reason: calibration.locked ? "LOCKED" : calibration.ran ? null : "WAITING_FOR_FIVE_RESULTS",
      };
    });
    return cronJson("cron/calibrate-models", result, result.errors, result.ran ? result.definitions.length : 1);
  } catch (error) {
    logError("cron/calibrate-models", error, { context });
    return NextResponse.json({ error: "Bezpečný přepočet modelů selhal" }, { status: 502 });
  }
}
