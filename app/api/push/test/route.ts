import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { prisma } from "@/lib/db";
import { pushConfigured, sendPushSubscription } from "@/lib/push";
import { allowRequest, tooMany } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });
  if (!allowRequest(`push-test:${user.id}`, 3, 60_000)) return tooMany();
  if (!pushConfigured()) return NextResponse.json({ error: "Web Push není nakonfigurován" }, { status: 503 });
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  if (!subscriptions.length) return NextResponse.json({ error: "Nejdřív zapni upozornění na tomto zařízení" }, { status: 409 });
  const base = new URL(req.url).origin;
  let sent = 0;
  let errors = 0;
  for (const subscription of subscriptions) {
    try {
      if (await sendPushSubscription(subscription, {
        title: "Football Insight funguje",
        body: "Testovací upozornění bylo úspěšně doručeno.",
        url: base,
        tag: `push-test-${Date.now()}`,
      })) sent++;
    } catch {
      errors++;
    }
  }
  if (!sent) return NextResponse.json({ error: "Test se nepodařilo doručit", errors }, { status: 502 });
  return NextResponse.json({ ok: true, sent, errors });
}
