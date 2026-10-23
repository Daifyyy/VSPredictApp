import { NextResponse } from "next/server";

/** Retired duplicate reader: no data access or historical scan. */
export async function GET() {
  return NextResponse.json({ error: "Tento duplicitní přehled byl ukončen. Použij Sázkové strategie.",
    replacement: "/strategie", code: "PORTFOLIO_CONSOLIDATED" },
  { status: 410, headers: { "Cache-Control": "public, max-age=3600" } });
}
