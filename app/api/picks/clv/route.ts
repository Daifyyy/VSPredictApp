import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { marketSignalHistory } from "@/lib/data/marketSignalStats";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

const querySchema = z.object({
  market: z.enum(["1X2", "OVER_25", "CORNERS", "CARDS"]).optional(),
  context: z.enum(["LEAGUE", "EURO_CUP"]).optional(),
  leagueId: z.coerce.number().int().positive().optional(),
  direction: z.enum(["positive", "negative"]).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: Request) {
  if (!allowRequest(`picks-clv:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const user = await getCurrentUser();
  if (!getEntitlement(user).pro) return NextResponse.json({ locked: true }, { status: 403 });
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný filtr" }, { status: 400 });
  try {
    return NextResponse.json(await marketSignalHistory(parsed.data));
  } catch (error) {
    logError("api/picks/clv", error);
    return NextResponse.json({ error: "Historii CLV se nepodařilo načíst" }, { status: 502 });
  }
}
