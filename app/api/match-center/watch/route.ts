import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Přihlášení je vyžadováno" }, { status: 401 });
  const body = await req.json().catch(() => null) as { fixtureId?: unknown; watching?: unknown } | null;
  const fixtureId = Number(body?.fixtureId);
  if (!Number.isInteger(fixtureId) || typeof body?.watching !== "boolean") return NextResponse.json({ error: "Neplatný požadavek" }, { status: 400 });
  if (!body.watching) {
    await prisma.liveFixtureWatch.deleteMany({ where: { userId: user.id, fixtureId } });
    return NextResponse.json({ watching: false });
  }
  const expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
  await prisma.liveFixtureWatch.upsert({ where: { userId_fixtureId: { userId: user.id, fixtureId } }, update: { expiresAt }, create: { userId: user.id, fixtureId, expiresAt } });
  return NextResponse.json({ watching: true, expiresAt });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ watching: false });
  const fixtureId = Number(new URL(req.url).searchParams.get("fixture"));
  const row = Number.isInteger(fixtureId) ? await prisma.liveFixtureWatch.findUnique({ where: { userId_fixtureId: { userId: user.id, fixtureId } } }) : null;
  return NextResponse.json({ watching: Boolean(row && row.expiresAt > new Date()) });
}
