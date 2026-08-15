import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { cronJson } from "@/lib/cronResult";
import { logError } from "@/lib/logError";
import { sendKickoffReminders } from "@/lib/push";
import { prisma } from "@/lib/db";

export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const stats = await sendKickoffReminders();
    const completedAt = new Date();
    const healthKey = "cronhealth:send-notifications";
    const previous = await prisma.apiCache.findUnique({ where: { key: healthKey }, select: { payload: true } });
    const previousSuccessfulAt = typeof previous?.payload === "object" && previous.payload !== null &&
      "completedAt" in previous.payload && typeof previous.payload.completedAt === "string"
      ? previous.payload.completedAt
      : null;
    const succeeded = stats.sent + stats.checkedFixtures;
    if (!(stats.errors > 0 && succeeded === 0)) {
      await prisma.apiCache.upsert({
        where: { key: healthKey },
        create: {
          key: healthKey,
          payload: { completedAt: completedAt.toISOString(), ...stats },
          expiresAt: new Date(completedAt.getTime() + 366 * 24 * 60 * 60_000),
        },
        update: {
          payload: { completedAt: completedAt.toISOString(), ...stats },
          expiresAt: new Date(completedAt.getTime() + 366 * 24 * 60 * 60_000),
        },
      });
    }
    const result = { ...stats, completedAt: completedAt.toISOString(), previousSuccessfulAt };
    return cronJson("cron/send-notifications", result, stats.errors, succeeded);
  } catch (error) {
    logError("cron/send-notifications", error);
    return NextResponse.json({ error: "Odesílání upozornění selhalo" }, { status: 502 });
  }
}
