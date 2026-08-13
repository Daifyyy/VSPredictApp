import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";
import { assignKnownReferee, RefereeAssignmentError } from "@/lib/data/refereeAdmin";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";

const bodySchema = z.object({ fixtureId: z.number().int().positive(), refereeKey: z.string().min(1).max(160) });

export async function POST(request: Request) {
  if (!allowRequest(`referee-assign:${clientKey(request)}`, 20, 60_000)) return tooMany();
  const user = await getCurrentUser();
  if (!user?.email || !isAdminEmail(user.email)) return NextResponse.json({ error: "Zakázáno" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neplatné zadání" }, { status: 400 });
  try {
    return NextResponse.json({ assignment: await assignKnownReferee(parsed.data.fixtureId, parsed.data.refereeKey, user.email) });
  } catch (error) {
    if (error instanceof RefereeAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
