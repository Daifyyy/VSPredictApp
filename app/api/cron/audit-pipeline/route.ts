import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { auditPipeline, withCronRun } from "@/lib/operations";
import { logError } from "@/lib/logError";

export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const result = await withCronRun("audit-pipeline", async () => {
      const health = await auditPipeline();
      return {
        ...health,
        candidates: health.coverage.reduce((sum, row) => sum + row.eligible, 0),
        processed: health.coverage.reduce((sum, row) => sum + row.covered, 0),
        // NalezenĂ˝ incident nenĂ­ chyba samotnĂ©ho auditu. Jinak audit vytvĂˇĹ™Ă­
        // rekurzivnĂ­ faleĹˇnĂ˝ poplach pokaĹľdĂ©, kdy korektnÄ› odhalĂ­ problĂ©m jinde.
        errors: 0,
        findings: health.incidents.length,
        remaining: health.overdue,
      };
    });
    return NextResponse.json({ ok: result.errors === 0, ...result }, { status: result.processed === 0 && result.errors > 0 ? 502 : 200 });
  } catch (error) {
    logError("cron/audit-pipeline", error);
    return NextResponse.json({ error: "Audit pipeline selhal" }, { status: 502 });
  }
}
