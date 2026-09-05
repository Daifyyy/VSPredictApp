import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, isRealDataConfigured } from "@/lib/db";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
const input = z.object({ kind: z.enum(["CHUNK_LOAD_ERROR", "SLOW_RESUME", "APP_SHELL_ERROR"]), durationMs: z.number().int().min(0).max(120000).optional(), swState: z.string().max(32).optional(), buildId: z.string().max(64).optional() });
export async function POST(request: Request) { if (!allowRequest(`client-diagnostic:${clientKey(request)}`, 5, 60_000)) return tooMany(); const parsed = input.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Neplatná diagnostika" }, { status: 400 }); if (isRealDataConfigured()) await prisma.pwaDiagnostic.create({ data: parsed.data }); return NextResponse.json({ ok: true }, { status: 202 }); }
