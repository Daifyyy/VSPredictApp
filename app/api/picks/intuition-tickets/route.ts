import { NextResponse } from "next/server";
import { isRealDataConfigured } from "@/lib/db";
import { previewIntuitionTickets } from "@/lib/data/intuitionTicketStore";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  if (!allowRequest(`intuition-tickets:${clientKey(request)}`, 60, 60_000)) return tooMany();
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!DATE.test(date)) return NextResponse.json({ error: "Neplatné datum" }, { status: 400 });
  if (!isRealDataConfigured()) return NextResponse.json({ date, frozen: false, tickets: [] });
  try {
    return NextResponse.json({ date, ...(await previewIntuitionTickets(date)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("api/picks/intuition-tickets", error, { date });
    return NextResponse.json({ error: "Intuitivní tikety se nepodařilo načíst" }, { status: 502 });
  }
}
