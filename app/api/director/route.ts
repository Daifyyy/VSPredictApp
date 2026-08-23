import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { allowRequest, tooMany } from "@/lib/rateLimit";
import { acceptDirectorSponsor, advanceDirectorDay, createDirectorWorld, financeDirectorProject, getDirectorWorld, isDirectorLeagueAllowed, manageDirectorAcademyPlayer, manageDirectorCoach, manageDirectorStaff, markDirectorAchievementsSeen, openDirectorCoachNegotiation, openDirectorNegotiation, openDirectorTransferCase, publishDirectorStatement, resolveDirectorEvent, resolveDirectorInvestigation, resolveDirectorSportMeeting, resolveIncomingTransfer, rolloverDirectorSeason, scoutDirectorPlayer, startDirectorCapitalProject, startDirectorProject, submitDirectorCoachOffer, submitDirectorContractOffer, submitDirectorOffer, submitDirectorTransferOffer, updateDirectorIdentity, updateDirectorPlayer, updateDirectorShortlist, updateDirectorSportPolicy, updateDirectorTicketPolicy } from "@/lib/director/dal";

export const maxDuration = 60;

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"), leagueId: z.number().int(), teamId: z.number().int(),
    directorName: z.string().trim().min(2).max(50), ethicsMode: z.enum(["OFF", "REALISTIC", "EXTENDED"]).default("REALISTIC"),
  }),
  z.object({ action: z.literal("advance") }),
  z.object({ action: z.literal("rollover_season") }),
  z.object({ action: z.literal("ack_achievements") }),
  z.object({ action: z.literal("open_negotiation"), playerId: z.string().cuid() }),
  z.object({ action: z.literal("submit_offer"), negotiationId: z.string().cuid(), upfront: z.number().int().min(0).max(1_000_000_000), installments: z.number().int().min(0).max(1_000_000_000), bonuses: z.number().int().min(0).max(1_000_000_000), sellOn: z.number().min(0).max(35), weeklyWage: z.number().int().min(100).max(10_000_000), years: z.number().int().min(1).max(6), promisedRole: z.enum(["STARTER", "ROTATION", "SQUAD"]) }),
  z.object({ action: z.literal("start_project"), kind: z.enum(["ATMOSPHERE", "COMMERCIAL", "ACADEMY"]) }),
  z.object({ action: z.literal("start_capital_project"), kind: z.enum(["PITCH", "ACTIVE_END", "HOSPITALITY", "EXPANSION", "NEW_STADIUM", "ACADEMY"]) }),
  z.object({ action: z.literal("finance_project"), projectId: z.string().cuid(), cash: z.number().int().min(0), loan: z.number().int().min(0), owner: z.number().int().min(0), partner: z.number().int().min(0) }),
  z.object({ action: z.literal("ticket_policy"), standardPrice: z.number().int(), familyPrice: z.number().int(), premiumPrice: z.number().int(), seasonTicket: z.number().int() }),
  z.object({ action: z.literal("academy_player"), playerId: z.string().cuid(), command: z.enum(["U19", "FIRST_TEAM_TRAINING", "PROMOTE", "RELEASE"]), focus: z.string().max(40).optional() }),
  z.object({ action: z.literal("update_identity"), declared: z.array(z.enum(["ACADEMY", "LOCAL", "DATA", "SUSTAINABLE", "ATTRACTIVE", "WIN_NOW", "COMMERCIAL"])).max(3) }),
  z.object({ action: z.literal("accept_sponsor"), offerId: z.string().cuid() }),
  z.object({ action: z.literal("resolve_event"), eventId: z.string().cuid(), choiceKey: z.string().min(1).max(40) }),
  z.object({ action: z.literal("coach_action"), command: z.enum(["SUPPORT", "WARN", "SHARED_AUTHORITY", "DIRECTOR_AUTHORITY", "DISMISS"]) }),
  z.object({ action: z.literal("staff_action"), staffId: z.string().cuid(), command: z.enum(["HIRE", "FIRE"]) }),
  z.object({ action: z.literal("open_coach_negotiation"), candidateId: z.string().cuid() }),
  z.object({ action: z.literal("submit_coach_offer"), negotiationId: z.string().cuid(), weeklyWage: z.number().int().min(1000).max(1_000_000), years: z.number().int().min(1).max(6), transferAuthority: z.enum(["DIRECTOR", "CONSULT", "COACH"]), transferVeto: z.boolean(), youthTarget: z.number().min(0).max(.5), minimumPatienceDays: z.number().int().min(7).max(120) }),
  z.object({ action: z.literal("player_action"), playerId: z.string().cuid(), command: z.enum(["LIST", "UNLIST", "RENEW"]), role: z.enum(["STARTER", "ROTATION", "SQUAD"]).optional() }),
  z.object({ action: z.literal("open_transfer_case"), playerId: z.string().cuid(), kind: z.enum(["PERMANENT", "LOAN"]).default("PERMANENT") }),
  z.object({ action: z.literal("submit_transfer_offer"), caseId: z.string().cuid(), upfront: z.number().int().min(0).max(1_000_000_000), installments: z.number().int().min(0).max(1_000_000_000), bonuses: z.number().int().min(0).max(1_000_000_000), sellOn: z.number().min(0).max(35), loanFee: z.number().int().min(0).max(1_000_000_000).default(0), optionFee: z.number().int().min(0).max(1_000_000_000).optional(), weeklyWage: z.number().int().min(100).max(10_000_000), years: z.number().int().min(1).max(6), promisedRole: z.enum(["STARTER", "ROTATION", "SQUAD"]) }),
  z.object({ action: z.literal("submit_contract_offer"), negotiationId: z.string().cuid(), weeklyWage: z.number().int().min(100).max(10_000_000), years: z.number().int().min(1).max(6), signingBonus: z.number().int().min(0).max(100_000_000), appearanceBonus: z.number().int().min(0).max(10_000_000), goalBonus: z.number().int().min(0).max(10_000_000), releaseClause: z.number().int().min(0).max(2_000_000_000).optional(), promisedRole: z.enum(["STARTER", "ROTATION", "SQUAD"]), promisedShare: z.number().min(.05).max(1), agentFee: z.number().int().min(0).max(100_000_000) }),
  z.object({ action: z.literal("scout_player"), playerId: z.string().cuid() }),
  z.object({ action: z.literal("shortlist"), playerId: z.string().cuid(), command: z.enum(["ADD", "REMOVE"]), priority: z.number().int().min(1).max(3).default(2) }),
  z.object({ action: z.literal("resolve_incoming_transfer"), caseId: z.string().cuid(), decision: z.enum(["ACCEPT", "REJECT"]) }),
  z.object({ action: z.literal("update_sport_policy"), desiredStyle: z.enum(["BALANCED", "POSSESSION", "HIGH_PRESS", "TRANSITION", "DEEP_BLOCK"]), youthPreference: z.number().min(0).max(1), rotationLevel: z.number().min(0).max(1), trainingIntensity: z.number().min(0).max(1), healthRiskTolerance: z.number().min(0).max(1), phasePriorities: z.record(z.string(), z.number().min(0).max(100)) }),
  z.object({ action: z.literal("resolve_sport_meeting"), meetingId: z.string().cuid(), choice: z.enum(["SUPPORT", "REQUEST_PRIORITY", "INSIST_MANDATE"]) }),
  z.object({ action: z.literal("publish_statement"), storyId: z.string().cuid(), tone: z.enum(["FACTUAL", "DIPLOMATIC", "AMBITIOUS", "DEFENSIVE", "EMOTIONAL", "NO_COMMENT"]) }),
  z.object({ action: z.literal("resolve_investigation"), investigationId: z.string().cuid(), response: z.enum(["DISCLOSE", "REMEDIATE", "LEGAL_REVIEW", "DENY", "SILENCE"]) }),
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
    if (parsed.data.action === "rollover_season") return NextResponse.json({ world: await rolloverDirectorSeason(user) });
    if (parsed.data.action === "ack_achievements") return NextResponse.json({ world: await markDirectorAchievementsSeen(user) });
    if (parsed.data.action === "open_negotiation") return NextResponse.json({ world: await openDirectorNegotiation(user, parsed.data.playerId) });
    if (parsed.data.action === "submit_offer") return NextResponse.json({ world: await submitDirectorOffer(user, parsed.data.negotiationId, parsed.data) });
    if (parsed.data.action === "start_project") return NextResponse.json({ world: await startDirectorProject(user, parsed.data.kind) });
    if (parsed.data.action === "start_capital_project") return NextResponse.json({ world: await startDirectorCapitalProject(user, parsed.data.kind) });
    if (parsed.data.action === "finance_project") return NextResponse.json({ world: await financeDirectorProject(user, parsed.data.projectId, parsed.data) });
    if (parsed.data.action === "ticket_policy") return NextResponse.json({ world: await updateDirectorTicketPolicy(user, parsed.data) });
    if (parsed.data.action === "academy_player") return NextResponse.json({ world: await manageDirectorAcademyPlayer(user, parsed.data.playerId, parsed.data.command, parsed.data.focus) });
    if (parsed.data.action === "update_identity") return NextResponse.json({ world: await updateDirectorIdentity(user, parsed.data.declared) });
    if (parsed.data.action === "accept_sponsor") return NextResponse.json({ world: await acceptDirectorSponsor(user, parsed.data.offerId) });
    if (parsed.data.action === "coach_action") return NextResponse.json({ world: await manageDirectorCoach(user, parsed.data.command) });
    if (parsed.data.action === "staff_action") return NextResponse.json({ world: await manageDirectorStaff(user, parsed.data.staffId, parsed.data.command) });
    if (parsed.data.action === "open_coach_negotiation") return NextResponse.json({ world: await openDirectorCoachNegotiation(user, parsed.data.candidateId) });
    if (parsed.data.action === "submit_coach_offer") return NextResponse.json({ world: await submitDirectorCoachOffer(user, parsed.data.negotiationId, parsed.data) });
    if (parsed.data.action === "player_action") return NextResponse.json({ world: await updateDirectorPlayer(user, parsed.data.playerId, parsed.data.command, parsed.data.role) });
    if (parsed.data.action === "open_transfer_case") return NextResponse.json({ world: await openDirectorTransferCase(user, parsed.data.playerId, parsed.data.kind) });
    if (parsed.data.action === "submit_transfer_offer") return NextResponse.json({ world: await submitDirectorTransferOffer(user, parsed.data.caseId, parsed.data) });
    if (parsed.data.action === "submit_contract_offer") return NextResponse.json({ world: await submitDirectorContractOffer(user, parsed.data.negotiationId, parsed.data) });
    if (parsed.data.action === "scout_player") return NextResponse.json({ world: await scoutDirectorPlayer(user, parsed.data.playerId) });
    if (parsed.data.action === "shortlist") return NextResponse.json({ world: await updateDirectorShortlist(user, parsed.data.playerId, parsed.data.command, parsed.data.priority) });
    if (parsed.data.action === "resolve_incoming_transfer") return NextResponse.json({ world: await resolveIncomingTransfer(user, parsed.data.caseId, parsed.data.decision) });
    if (parsed.data.action === "update_sport_policy") return NextResponse.json({ world: await updateDirectorSportPolicy(user, parsed.data) });
    if (parsed.data.action === "resolve_sport_meeting") return NextResponse.json({ world: await resolveDirectorSportMeeting(user, parsed.data.meetingId, parsed.data.choice) });
    if (parsed.data.action === "publish_statement") return NextResponse.json({ world: await publishDirectorStatement(user, parsed.data.storyId, parsed.data.tone) });
    if (parsed.data.action === "resolve_investigation") return NextResponse.json({ world: await resolveDirectorInvestigation(user, parsed.data.investigationId, parsed.data.response) });
    return NextResponse.json({ world: await resolveDirectorEvent(user, parsed.data.eventId, parsed.data.choiceKey) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Herní příkaz selhal.";
    const conflict = /Nejdřív|odemkne|není dostupné/.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}
