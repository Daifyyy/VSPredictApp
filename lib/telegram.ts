import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { localDateKey } from "@/lib/competitionGrouping";
import { strategyHubData, type StrategyHubMetrics, type StrategyHubOpportunity, type StrategyHubTicket } from "@/lib/data/strategyHubStore";
import { prisma } from "@/lib/db";
import { upsertIncident } from "@/lib/operations";
import { STRATEGY_HUB_CATALOG, STRATEGY_HUB_IDS, isDateKey, type StrategyHubId } from "@/lib/picks/strategyHub";

export const TELEGRAM_TOP_LIMIT = 3;
export const TELEGRAM_PAGE_SIZE = 5;
const TEXT_LIMIT = 3900;
type Kind = "RESULTS" | "TICKETS" | "STRATEGIES";
type HubData = { opportunities: StrategyHubOpportunity[]; tickets: StrategyHubTicket[]; metrics: StrategyHubMetrics; coverage: { candidates: number; priced: number; tickets: number }; emptyReason: string | null };
export type TelegramDay = { date: string; generatedAt: string; strategies: Array<{ strategy: StrategyHubId; data: HubData }> };
const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const esc = (value: unknown) => String(value ?? "").slice(0, 900).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const odd = (value: number | null) => value == null ? "—" : value.toFixed(2);

export function telegramConfig() {
  return { enabled: process.env.TELEGRAM_ENABLED === "true", token: process.env.TELEGRAM_BOT_TOKEN ?? "", channelId: process.env.TELEGRAM_CHANNEL_ID ?? "", webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "", allowedUsers: new Set((process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean)) };
}

export function pragueClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function shiftDateKey(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function isTelegramDateAllowed(date: string, today = localDateKey(new Date())) { if (!isDateKey(date)) return false; const delta = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000; return delta >= -30 && delta <= 7; }
export async function loadTelegramDay(date: string): Promise<TelegramDay> { return { date, generatedAt: new Date().toISOString(), strategies: await Promise.all(STRATEGY_HUB_IDS.map(async (strategy) => ({ strategy, data: await strategyHubData(strategy, date) as HubData }))) }; }
const title = (id: StrategyHubId) => STRATEGY_HUB_CATALOG.find((item) => item.id === id)?.title ?? id;
const strategyIcon = (id: StrategyHubId) => ({ VALUE: "💎", ELO_INTUITION: "🧠", ONE_X_TWO: "🏆", OVER_25: "⚽", BTTS_YES: "🥅", TEAM_GOALS: "🎯", CORNERS: "🚩", CARDS_REF: "🟨", FOULS: "📋" })[id];
const outcomeIcon = (value: StrategyHubOpportunity["outcome"]) => value === "PENDING" ? "⏳" : value === "WON" ? "✅" : value === "LOST" ? "❌" : "↩️";
const ticketOutcomeIcon = (value: StrategyHubTicket["outcome"]) => value === "PENDING" ? "⏳" : value === "WON" ? "✅" : value === "LOST" ? "❌" : "↩️";

function opportunity(item: StrategyHubOpportunity) {
  const price = item.priceKind === "SYNTHETIC" ? `${odd(item.odds)} <i>(odhad)</i>` : item.priceKind === "NONE" ? "bez kurzu" : odd(item.odds);
  return `${outcomeIcon(item.outcome)} <b>${esc(item.homeName)} – ${esc(item.awayName)}</b>\n   🎯 ${esc(item.selection)}\n   💰 ${price}`;
}
function empty(id: StrategyHubId) { return `${strategyIcon(id)} <b>${esc(title(id))}</b>\n   Dnes bez výběru.`; }

export function splitTelegramBlocks(blocks: string[], limit = TEXT_LIMIT) {
  const chunks: string[] = []; let current = "";
  for (const block of blocks) {
    if (block.length > limit) { if (current) chunks.push(current); for (let i = 0; i < block.length; i += limit) chunks.push(block.slice(i, i + limit)); current = ""; }
    else if (!current) current = block;
    else if (`${current}\n\n${block}`.length <= limit) current += `\n\n${block}`;
    else { chunks.push(current); current = block; }
  }
  if (current) chunks.push(current); return chunks;
}

export function formatTips(payload: TelegramDay, requested?: StrategyHubId, limit = TELEGRAM_TOP_LIMIT, skip = 0) {
  const blocks = [`📅 <b>Výběry na ${payload.date}</b>`];
  for (const { strategy, data } of payload.strategies.filter((row) => !requested || row.strategy === requested)) {
    const picks = data.opportunities.slice(skip, skip + limit); blocks.push(picks.length ? `${strategyIcon(strategy)} <b>${esc(title(strategy))}</b>` : empty(strategy), ...picks.map(opportunity));
  }
  return splitTelegramBlocks(blocks);
}
export function formatTickets(payload: TelegramDay, requested?: "VALUE" | "ELO_INTUITION", includeReserves = false) {
  const blocks = [`🎟️ <b>Tikety na ${payload.date}</b>`];
  for (const id of (requested ? [requested] : ["VALUE", "ELO_INTUITION"]) as Array<"VALUE" | "ELO_INTUITION">) {
    const data = payload.strategies.find((row) => row.strategy === id)?.data;
    if (!data?.tickets.length) { blocks.push(data ? empty(id) : `${strategyIcon(id)} <b>${title(id)}</b>\n   Data nejsou dostupná.`); continue; }
    blocks.push(`${strategyIcon(id)} <b>${esc(title(id))}</b>`, ...data.tickets.map((ticket) => `${ticketOutcomeIcon(ticket.outcome)} <b>Tiket ${ticket.slot === 0 ? "A" : "B"}</b>\n   🎯 ${ticket.fixtureIds.length} výběry\n   💰 kurz ${odd(ticket.odds)}`));
    const reserves = includeReserves ? data.opportunities.filter((item) => !item.ticketSlots.length).slice(0, 5) : [];
    if (reserves.length) blocks.push("➕ <b>Další vybrané příležitosti</b>", ...reserves.map(opportunity));
  }
  return splitTelegramBlocks(blocks);
}
export function formatResults(payload: TelegramDay) {
  const blocks = [`📊 <b>Výsledky za ${payload.date}</b>`];
  for (const { strategy, data } of payload.strategies) {
    const settled = data.opportunities.filter((item) => item.outcome !== "PENDING"); const tickets = data.tickets.filter((item) => item.outcome !== "PENDING");
    if (settled.length || tickets.length) blocks.push(`${strategyIcon(strategy)} <b>${esc(title(strategy))}</b>`, ...settled.map(opportunity), ...tickets.map((ticket) => `${ticketOutcomeIcon(ticket.outcome)} <b>Tiket ${ticket.slot === 0 ? "A" : "B"}</b> · kurz ${odd(ticket.odds)}`));
  }
  if (blocks.length === 1) blocks.push("Zatím není uzavřen žádný publikovaný výběr."); return splitTelegramBlocks(blocks);
}
export function formatStatus(payload: TelegramDay) { return splitTelegramBlocks([`<b>Stav dat · ${payload.date}</b>\nAktualizováno ${esc(payload.generatedAt)}`, ...payload.strategies.map(({ strategy, data }) => `<b>${esc(title(strategy))}</b>: ${data.opportunities.length} výběrů, ${data.coverage.priced} s kurzem${data.emptyReason ? ` · ${esc(data.emptyReason)}` : ""}`)]); }

export async function sendTelegramMessages(chatId: string, messages: string[], onSent?: (messageId: number) => Promise<void>) {
  const { token } = telegramConfig(); if (!token) throw new Error("TELEGRAM_BOT_TOKEN není nakonfigurován"); const ids: number[] = [];
  for (const text of messages) { const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }) }); const body = await response.json() as { ok?: boolean; result?: { message_id?: number }; description?: string }; if (!response.ok || !body.ok || !body.result?.message_id) throw new Error(body.description ?? `Telegram HTTP ${response.status}`); ids.push(body.result.message_id); if (onSent) await onSent(body.result.message_id); }
  return ids;
}
const messagesFor = (kind: Kind, payload: TelegramDay) => kind === "RESULTS" ? formatResults(payload) : kind === "TICKETS" ? formatTickets(payload) : formatTips({ ...payload, strategies: payload.strategies.filter((row) => row.strategy !== "VALUE" && row.strategy !== "ELO_INTUITION") });

async function publishedResults(date: string, channelId: string) {
  const prior = channelId ? await prisma.telegramPublication.findMany({ where: { dateKey: date, channelId, kind: { in: ["STRATEGIES", "TICKETS"] }, status: "SENT" }, select: { kind: true, payload: true } }) : [];
  const current = await loadTelegramDay(date); if (!prior.length) return { ...current, strategies: current.strategies.map((row) => ({ ...row, data: { ...row.data, opportunities: [], tickets: [] } })) };
  const ids = new Map<StrategyHubId, Set<string>>(); const slots = new Map<StrategyHubId, Set<number>>();
  for (const publication of prior) {
    const snapshot = publication.payload as unknown as TelegramDay;
    for (const row of snapshot.strategies) {
      if (publication.kind === "STRATEGIES" && row.strategy !== "VALUE" && row.strategy !== "ELO_INTUITION") ids.set(row.strategy, new Set(row.data.opportunities.slice(0, TELEGRAM_TOP_LIMIT).map((item) => item.id)));
      if (publication.kind === "TICKETS" && (row.strategy === "VALUE" || row.strategy === "ELO_INTUITION")) { const ticketSlots = new Set(row.data.tickets.map((item) => item.slot)); slots.set(row.strategy, ticketSlots); ids.set(row.strategy, new Set(row.data.opportunities.filter((item) => item.ticketSlots.some((slot) => ticketSlots.has(slot))).map((item) => item.id))); }
    }
  }
  return { ...current, strategies: current.strategies.map((row) => ({ ...row, data: { ...row.data, opportunities: row.data.opportunities.filter((item) => ids.get(row.strategy)?.has(item.id)), tickets: row.data.tickets.filter((item) => slots.get(row.strategy)?.has(item.slot)) } })) };
}

export async function publishTelegramMorning(now = new Date(), options: { dryRun?: boolean; force?: boolean } = {}) {
  const config = telegramConfig(); const clock = pragueClock(now); if (!options.force && clock.hour !== 9) return { skipped: "OUTSIDE_PRAGUE_09", date: clock.date };
  await Promise.all([
    prisma.telegramPublication.updateMany({ where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) } }, data: { status: "FAILED", lastError: "Obnova po přerušeném odesílání" } }),
    prisma.telegramCommandCursor.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 30 * 86400_000) } } }),
    prisma.telegramUpdateReceipt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400_000) } } }),
  ]);
  const today = await loadTelegramDay(clock.date); const entries: Array<{ kind: Kind; payload: TelegramDay }> = [{ kind: "RESULTS", payload: await publishedResults(shiftDateKey(clock.date, -1), config.channelId) }, { kind: "TICKETS", payload: today }, { kind: "STRATEGIES", payload: today }];
  if (options.dryRun || !config.enabled) return { dryRun: true, date: clock.date, messages: entries.flatMap((entry) => messagesFor(entry.kind, entry.payload)) };
  if (!config.channelId || !config.token) throw new Error("Telegram kanál nebo token není nakonfigurován"); const sent: string[] = [];
  for (const entry of entries) {
    const proposedContent = messagesFor(entry.kind, entry.payload); const hash = createHash("sha256").update(proposedContent.join("\n---\n")).digest("hex"); const versions = Object.fromEntries(STRATEGY_HUB_CATALOG.map((item) => [item.id, item.policyVersion]));
    const row = await prisma.telegramPublication.upsert({ where: { dateKey_channelId_kind: { dateKey: clock.date, channelId: config.channelId, kind: entry.kind } }, create: { dateKey: clock.date, channelId: config.channelId, kind: entry.kind, policyVersions: versions, payload: asJson(entry.payload), contentHash: hash }, update: {} });
    const content = messagesFor(entry.kind, row.payload as unknown as TelegramDay);
    if (row.status === "SENT") continue; const claimed = await prisma.telegramPublication.updateMany({ where: { id: row.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "SENDING", attempts: { increment: 1 }, lastError: null } }); if (!claimed.count) continue;
    try {
      const existingIds = Array.isArray(row.messageIds) ? row.messageIds.filter((id): id is number => typeof id === "number") : [];
      const messageIds = [...existingIds];
      await sendTelegramMessages(config.channelId, content.slice(existingIds.length), async (messageId) => { messageIds.push(messageId); await prisma.telegramPublication.update({ where: { id: row.id }, data: { messageIds } }); });
      await prisma.telegramPublication.update({ where: { id: row.id }, data: { status: "SENT", messageIds, sentAt: new Date() } }); sent.push(entry.kind);
    }
    catch (error) { const message = error instanceof Error ? error.message : String(error); await prisma.telegramPublication.update({ where: { id: row.id }, data: { status: "FAILED", lastError: message } }); await upsertIncident({ fingerprint: `telegram:${clock.date}:${entry.kind}`, kind: "TELEGRAM_DELIVERY", severity: "CRITICAL", message: `Telegram ${entry.kind} se nepodařilo odeslat.`, details: { message } }); throw error; }
  }
  return { date: clock.date, sent };
}

const ALIASES: Record<string, StrategyHubId> = { value: "VALUE", elo: "ELO_INTUITION", "1x2": "ONE_X_TWO", over25: "OVER_25", btts: "BTTS_YES", tymove_goly: "TEAM_GOALS", rohy: "CORNERS", karty: "CARDS_REF", fauly: "FOULS" };
export const telegramStrategyAlias = (value?: string) => value ? ALIASES[value.toLowerCase()] ?? null : null;
export async function handleTelegramCommand(userId: string, text: string, now = new Date()) {
  const [raw, ...args] = text.trim().split(/\s+/); const command = raw.toLowerCase().split("@")[0]; const today = localDateKey(now);
  if (command === "/help") return ["<b>Příkazy</b>\n/tipy [strategie]\n/dalsi [strategie|vse]\n/tiket value|elo\n/vysledky [YYYY-MM-DD]\n/datum YYYY-MM-DD [strategie]\n/stav"];
  if (command === "/vysledky") { const date = args[0] ?? shiftDateKey(today, -1); return isTelegramDateAllowed(date, today) ? formatResults(await loadTelegramDay(date)) : ["Neplatné nebo nepovolené datum."]; }
  if (command === "/stav") return formatStatus(await loadTelegramDay(today));
  if (command === "/tiket") { const strategy = telegramStrategyAlias(args[0]); return strategy === "VALUE" || strategy === "ELO_INTUITION" ? formatTickets(await loadTelegramDay(today), strategy, true) : ["Použij /tiket value nebo /tiket elo."]; }
  if (command === "/datum") { const strategy = telegramStrategyAlias(args[1]); if (!args[0] || !isTelegramDateAllowed(args[0], today)) return ["Použij /datum YYYY-MM-DD [strategie]. Povolen je včerejšek až +7 dní."]; if (args[1] && !strategy) return ["Neznámá strategie."]; return formatTips(await loadTelegramDay(args[0]), strategy ?? undefined); }
  if (command === "/tipy") { const strategy = telegramStrategyAlias(args[0]); return args[0] && !strategy ? ["Neznámá strategie."] : formatTips(await loadTelegramDay(today), strategy ?? undefined); }
  if (command === "/dalsi") {
    const all = args.includes("vse"); const strategyArg = args.find((arg) => arg !== "vse"); const strategy = telegramStrategyAlias(strategyArg); if (strategyArg && !strategy) return ["Neznámá strategie."]; const key = strategy ?? "ALL";
    const cursor = await prisma.telegramCommandCursor.findUnique({ where: { userId_dateKey_strategy: { userId, dateKey: today, strategy: key } } }); const offset = cursor?.offset ?? TELEGRAM_TOP_LIMIT; const payload = await loadTelegramDay(today); const available = strategy ? payload.strategies.find((row) => row.strategy === strategy)?.data.opportunities.length ?? 0 : Math.max(0, ...payload.strategies.map((row) => row.data.opportunities.length)); if (offset >= available) return ["Další kvalifikované výběry už nejsou."];
    const limit = all ? 1000 : TELEGRAM_PAGE_SIZE; const messages = formatTips(payload, strategy ?? undefined, limit, offset); await prisma.telegramCommandCursor.upsert({ where: { userId_dateKey_strategy: { userId, dateKey: today, strategy: key } }, create: { userId, dateKey: today, strategy: key, offset: Math.min(available, offset + limit) }, update: { offset: Math.min(available, offset + limit) } }); return messages;
  }
  return ["Neznámý příkaz. Použij /help."];
}
