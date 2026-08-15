import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { prisma } from "@/lib/db";
import { pushConfigured } from "@/lib/push";
import { allowRequest, tooMany } from "@/lib/rateLimit";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(3000),
  keys: z.object({ p256dh: z.string().min(20).max(1000), auth: z.string().min(8).max(500) }),
});

const preferenceSchema = z.object({
  enabled: z.boolean(),
  favoriteKickoff: z.boolean(),
  kickoffMinutes: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  publishedPrediction: z.boolean(),
  marketMovement: z.boolean(),
  movementThreshold: z.union([z.literal(3), z.literal(5), z.literal(8)]),
  smartFavoriteLeagues: z.boolean(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });
  const [subscriptionCount, preference] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId: user.id } }),
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
    subscribed: subscriptionCount > 0,
    preference: preference ?? { enabled: true, favoriteKickoff: true, kickoffMinutes: 60, publishedPrediction: false, marketMovement: false, movementThreshold: 3, smartFavoriteLeagues: false },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });
  if (!allowRequest(`push:${user.id}`, 20, 60_000)) return tooMany();
  if (!pushConfigured()) return NextResponse.json({ error: "Web Push není nakonfigurován" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const subscription = subscriptionSchema.safeParse(body?.subscription);
  const preference = preferenceSchema.safeParse(body?.preference);
  if (!subscription.success || !preference.success) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  await prisma.$transaction([
    prisma.pushSubscription.upsert({
      where: { endpoint: subscription.data.endpoint },
      create: {
        userId: user.id,
        endpoint: subscription.data.endpoint,
        p256dh: subscription.data.keys.p256dh,
        auth: subscription.data.keys.auth,
        userAgent: req.headers.get("user-agent"),
      },
      update: {
        userId: user.id,
        p256dh: subscription.data.keys.p256dh,
        auth: subscription.data.keys.auth,
        userAgent: req.headers.get("user-agent"),
      },
    }),
    prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...preference.data },
      update: preference.data,
    }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url().max(3000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: parsed.data.endpoint } });
  const remaining = await prisma.pushSubscription.count({ where: { userId: user.id } });
  await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, enabled: remaining > 0 },
      update: { enabled: remaining > 0 },
    });
  return NextResponse.json({ ok: true });
}
