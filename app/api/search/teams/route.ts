import { NextResponse } from "next/server";
import { getSearchableTeams } from "@/lib/data/repository";
import { logError } from "@/lib/logError";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { searchTeams } from "@/lib/teamSearch";

export async function GET(req: Request) {
  if (!allowRequest(`team-search:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const query = new URL(req.url).searchParams.get("q")?.slice(0, 80) ?? "";
  if (query.trim().length < 2) return NextResponse.json({ results: [] });

  try {
    const catalog = await getSearchableTeams();
    return NextResponse.json({ results: searchTeams(catalog, query) });
  } catch (error) {
    logError("api/team-search", error, { query });
    return NextResponse.json({ error: "Vyhledávání týmů se nepodařilo načíst" }, { status: 502 });
  }
}
