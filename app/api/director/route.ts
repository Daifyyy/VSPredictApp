import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { allowRequest, tooMany } from "@/lib/rateLimit";
import { advanceDirectorDay, createDirectorWorld, getDirectorWorld, isDirectorLeagueAllowed, markDirectorAchievementsSeen, openDirectorNegotiation, resolveDirectorEvent, startDirectorProject, submitDirectorOffer } from "@/lib/director/dal";

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"), leagueId: z.number().int(), teamId: z.number().int(),
    directorName: z.string().trim().min(2).max(50), ethicsMode: z.enum(["OFF", "REALISTIC", "EXTENDED"]).default("REALISTIC"),
  }),
  z.object({ action: z.literal("advance") }),
  z.object({ action: z.literal("ack_achievements") }),
  z.object({ action: z.literal("open_negotiation"), playerId: z.string().cuid() }),
  z.object({ action: z.literal("submit_offer"), negotiationId: z.string().cuid(), upfront: z.number().int().min(0).max(1_000_000_000), installments: z.number().int().min(0).max(1_000_000_000), bonuses: z.number().int().min(0).max(1_000_000_000), sellOn: z.number().min(0).max(35), weeklyWage: z.number().int().min(100).max(10_000_000), years: z.number().int().min(1).max(6), promisedRole: z.enum(["STARTER", "ROTATION", "SQUAD"]) }),
  z.object({ action: z.literal("start_project"), kind: z.enum(["ATMOSPHERE", "COMMERCIAL", "ACADEMY"]) }),
  z.object({ action: z.literal("resolve_event"), eventId: z.string().cuid(), choiceKey: z.string().min(1).max(40) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Pro hru se nejdřív přihlas." }, { status: 401 });
  if (!allowRequest(`director-read:${user.id}`, 120, 60_000)) return tooMany();
  try {
    return NextResponse.json({ world: await getDirectorWorld(user) });
  } catch {
    return NextResponse.json({ error: "Klubový svět se nepodařilo načíst." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Pro hru se nejdřív přihlas." }, { status: 401 });
  if (!allowRequest(`director-write:${user.id}`, 30, 60_000)) return tooMany();
  const parsed = commandSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný herní příkaz." }, { status: 400 });
  try {
    if (parsed.data.action === "create") {
      if (!isDirectorLeagueAllowed(parsed.data.leagueId)) return NextResponse.json({ error: "Soutěž není dostupná." }, { status: 400 });
      const world = await createDirectorWorld({ user, leagueId: parsed.data.leagueId, teamId: parsed.data.teamId, directorName: parsed.data.directorName, ethicsMode: parsed.data.ethicsMode });
      return NextResponse.json({ world }, { status: 201 });
    }
    if (parsed.data.action === "advance") return NextResponse.json({ world: await advanceDirectorDay(user) });
    if (parsed.data.action === "ack_achievements") return NextResponse.json({ world: await markDirectorAchievementsSeen(user) });
    if (parsed.data.action === "open_negotiation") return NextResponse.json({ world: await openDirectorNegotiation(user, parsed.data.playerId) });
    if (parsed.data.action === "submit_offer") return NextResponse.json({ world: await submitDirectorOffer(user, parsed.data.negotiationId, parsed.data) });
    if (parsed.data.action === "start_project") return NextResponse.json({ world: await startDirectorProject(user, parsed.data.kind) });
    return NextResponse.json({ world: await resolveDirectorEvent(user, parsed.data.eventId, parsed.data.choiceKey) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Herní příkaz selhal.";
    const conflict = /Nejdřív|odemkne|není dostupné/.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}
