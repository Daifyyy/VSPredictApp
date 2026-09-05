import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json({ buildId: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "development" }, { headers: { "Cache-Control": "no-store" } }); }
