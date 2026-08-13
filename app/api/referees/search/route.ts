import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";
import { searchKnownReferees } from "@/lib/data/refereeAdmin";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";

export async function GET(request: Request) {
  if (!allowRequest(`referee-search:${clientKey(request)}`, 60, 60_000)) return tooMany();
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "Zakázáno" }, { status: 403 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json(
    { results: await searchKnownReferees(query) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
