import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { MODEL_VERSION } from "@/lib/data/modelVersion";
import { MODEL_LAB_STATUSES, STRATEGY_CATALOG } from "@/lib/picks/modelLab";
import { logError } from "@/lib/logError";
import { rejectCrossSiteMutation } from "@/lib/requestSecurity";

const bodySchema = z.object({
  strategy: z.string().min(1).max(40),
  policyVersion: z.number().int().positive(),
  modelContext: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]),
  status: z.enum(MODEL_LAB_STATUSES),
  reason: z.string().trim().min(10).max(500),
});

export async function PATCH(request: Request) {
  const originError = rejectCrossSiteMutation(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user?.email || !isAdminEmail(user.email)) return NextResponse.json({ error: "Zakázáno" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neplatná změna" }, { status: 400 });
  const catalog = STRATEGY_CATALOG.find((item) => item.strategy === parsed.data.strategy && item.policyVersion === parsed.data.policyVersion);
  if (!catalog) return NextResponse.json({ error: "Neznámá strategie" }, { status: 404 });
  try {
    const key = { strategy_policyVersion_modelContext_modelVersion: { strategy: catalog.strategy, policyVersion: catalog.policyVersion, modelContext: parsed.data.modelContext, modelVersion: MODEL_VERSION } };
    const existing = await prisma.modelStrategyDefinition.findUnique({ where: key });
    const definition = await prisma.$transaction(async (tx) => {
      const row = await tx.modelStrategyDefinition.upsert({
        where: key,
        create: { strategy: catalog.strategy, policyVersion: catalog.policyVersion, market: catalog.market, modelContext: parsed.data.modelContext, modelVersion: MODEL_VERSION, status: parsed.data.status, title: catalog.title, rules: { text: catalog.rules }, decisionCriteria: { text: catalog.decision }, minimumSample: catalog.minimumSample, startedAt: new Date() },
        update: { status: parsed.data.status },
      });
      await tx.modelStrategyStatusAudit.create({ data: { definitionId: row.id, fromStatus: existing?.status ?? catalog.status, toStatus: parsed.data.status, reason: parsed.data.reason, changedBy: user.email! } });
      return row;
    });
    await prisma.modelStrategyMetricSnapshot.deleteMany({ where: { strategy: catalog.strategy, policyVersion: catalog.policyVersion, modelContext: parsed.data.modelContext, modelVersion: MODEL_VERSION } });
    return NextResponse.json({ id: definition.id, status: definition.status });
  } catch (error) {
    logError("api/picks/model-lab/status", error);
    return NextResponse.json({ error: "Stav strategie se nepodařilo uložit" }, { status: 502 });
  }
}
