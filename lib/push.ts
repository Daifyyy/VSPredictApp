import "server-only";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { prisma } from "@/lib/db";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION, MARKET_SIGNAL_POLICY_VERSION } from "@/lib/picks/marketSignals";
import { isMeaningfulMarketMove, isSmartNotificationTarget } from "@/lib/pushRules";
import { fetchFixturesByIds } from "@/lib/data/apiFootball";
import { chunkFixtureIds, matchStatusEvents } from "@/lib/pushMatchStatus";
import type { NewChecklistCandidate } from "@/lib/data/checklistStore";
import { DECISION_CHECKLIST_VERSION } from "@/lib/picks/decisionChecklist";
import { isAdminEmail } from "@/lib/entitlements";

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configure() {
  if (!pushConfigured()) throw new Error("Web Push není nakonfigurován");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

export async function sendPushSubscription(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string; tag: string }
): Promise<boolean> {
  configure();
  const target: WebPushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  try {
    await webpush.sendNotification(target, JSON.stringify(payload), { TTL: 60 * 60 });
    return true;
  } catch (error) {
    const status = typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : null;
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
      return false;
    }
    throw error;
  }
}

/** Jednorázové provozní upozornění vlastníkům z ADMIN_EMAILS. */
export async function sendOperationalAlert(input: { fingerprint: string; title: string; body: string }) {
  if (!pushConfigured()) return { sent: 0, errors: 0 };
  const users = await prisma.user.findMany({ include: { pushSubscriptions: true } });
  let sent = 0, errors = 0;
  for (const user of users) {
    if (!isAdminEmail(user.email)) continue;
    for (const subscription of user.pushSubscriptions) {
      try {
        if (await sendPushSubscription(subscription, {
          title: input.title,
          body: input.body,
          url: "/provoz",
          tag: `operations-${input.fingerprint}`,
        })) sent++;
      } catch { errors++; }
    }
  }
  return { sent, errors };
}

export async function sendChecklistCandidateNotifications(candidates: NewChecklistCandidate[]) {
  const stats = { candidates: candidates.length, eligible: 0, sent: 0, errors: 0 };
  if (!candidates.length || !pushConfigured()) return stats;
  const preferences = await prisma.notificationPreference.findMany({
    where: { enabled: true, checklistCandidate: true },
    include: { user: { select: { id: true, pushSubscriptions: true } } },
  });
  for (const candidate of candidates) {
    const marketLabel = candidate.market === "OVER_25" ? "Góly 2,5" : candidate.market === "CORNERS" ? "Rohy" : candidate.market === "CARDS" ? "Karty" : "Výsledek 1X2";
    const sideLabel = candidate.side === "HOME" ? candidate.homeName : candidate.side === "AWAY" ? candidate.awayName : candidate.side === "OVER" ? `Over ${candidate.line ?? 2.5}` : candidate.side === "UNDER" ? `Under ${candidate.line ?? 2.5}` : "Remíza";
    const type = `CHECKLIST_${candidate.market}_V${DECISION_CHECKLIST_VERSION}`;
    const url = `/porovnani?homeLeague=${candidate.leagueId}&awayLeague=${candidate.leagueId}&home=${candidate.homeTeamId}&away=${candidate.awayTeamId}&fixture=${candidate.fixtureId}#model-${candidate.fixtureId}`;
    for (const preference of preferences) {
      if (!preference.user.pushSubscriptions.length) continue;
      stats.eligible++;
      const exists = await prisma.notificationDelivery.findUnique({
        where: { userId_fixtureId_type: { userId: preference.userId, fixtureId: candidate.fixtureId, type } },
      });
      if (exists) continue;
      let delivered = false;
      for (const subscription of preference.user.pushSubscriptions) {
        try {
          delivered = await sendPushSubscription(subscription, {
            title: `Kandidát checklistu · ${marketLabel}`,
            body: `${candidate.homeName} – ${candidate.awayName} · ${sideLabel} · model ${Math.round(candidate.modelProbability * 100)} % · trh ${Math.round(candidate.marketProbability * 100)} % · +${(candidate.edge * 100).toFixed(1)} p. b.`,
            url,
            tag: `checklist-${candidate.fixtureId}-${candidate.market}`,
          }) || delivered;
        } catch {
          stats.errors++;
        }
      }
      if (!delivered) continue;
      await prisma.notificationDelivery.create({
        data: { userId: preference.userId, fixtureId: candidate.fixtureId, type },
      }).catch(() => {});
      stats.sent++;
    }
  }
  return stats;
}

export async function sendDirectorNotifications() {
  const stats = { eligible: 0, sent: 0, errors: 0 };
  if (!pushConfigured()) return stats;
  const outbox = await prisma.directorNotificationOutbox.findMany({ where: { status: "PENDING", availableAt: { lte: new Date() } }, include: { career: { select: { userId: true } } }, orderBy: { createdAt: "asc" }, take: 50 });
  const preferences = await prisma.notificationPreference.findMany({ where: { userId: { in: [...new Set(outbox.map((item) => item.career.userId))] }, enabled: true, directorImportant: true }, include: { user: { select: { pushSubscriptions: true } } } }); const byUser = new Map(preferences.map((item) => [item.userId, item]));
  for (const item of outbox) {
    const preference = byUser.get(item.career.userId); if (!preference?.user.pushSubscriptions.length) continue; stats.eligible++;
    let delivered = false; for (const subscription of preference.user.pushSubscriptions) try { delivered = await sendPushSubscription(subscription, { title: item.title, body: item.body, url: item.url, tag: `director-${item.id}` }) || delivered; } catch { stats.errors++; }
    await prisma.directorNotificationOutbox.update({ where: { id: item.id }, data: delivered ? { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } } : { attempts: { increment: 1 }, status: item.attempts >= 2 ? "FAILED" : "PENDING" } }); if (delivered) stats.sent++;
  }
  return stats;
}

export async function sendKickoffReminders(now = new Date()) {
  const emptyStats = { eligible: 0, sent: 0, errors: 0, checkedFixtures: 0, apiBatches: 0, halftimeSent: 0, finalSent: 0 };
  if (!pushConfigured()) return { ...emptyStats, configured: false };
  const preferences = await prisma.notificationPreference.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true, email: true, pushSubscriptions: true } } },
  });
  if (!preferences.length) return { ...emptyStats, configured: true };

  const hasResultSubscribers = preferences.some((preference) =>
    preference.halftimeAndFinal && preference.user.pushSubscriptions.length > 0
  );
  const fixtureSelect = {
    fixtureId: true, kickoff: true, homeName: true, awayName: true, leagueId: true,
    homeTeamId: true, awayTeamId: true, published1x2Side: true,
    published1x2Prob: true, publicationPolicyVersion: true, publishedAt: true,
  } as const;
  const [fixtures, resultCandidates] = await Promise.all([
    prisma.fixturePrediction.findMany({
      where: {
        kickoff: {
          gte: new Date(now.getTime() + 5 * 60_000),
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
        },
      },
      select: fixtureSelect,
    }),
    hasResultSubscribers
      ? prisma.fixturePrediction.findMany({
          where: {
            kickoff: {
              gte: new Date(now.getTime() - 4 * 60 * 60_000),
              lte: new Date(now.getTime() - 35 * 60_000),
            },
          },
          select: fixtureSelect,
        })
      : Promise.resolve([]),
  ]);

  const owners = preferences.map((preference) => preference.user.email ?? `user:${preference.user.id}`);
  const allFixtureIds = [...new Set([...fixtures, ...resultCandidates].map((fixture) => fixture.fixtureId))];
  const smartOwners = preferences
    .filter((preference) => preference.smartFavoriteLeagues)
    .map((preference) => preference.user.email ?? `user:${preference.user.id}`);
  const [favorites, favoriteLeagues, existingDeliveries] = await Promise.all([
    allFixtureIds.length
      ? prisma.favoriteFixture.findMany({
          where: { email: { in: owners }, fixtureId: { in: allFixtureIds } },
          select: { email: true, fixtureId: true },
        })
      : Promise.resolve([]),
    smartOwners.length
      ? prisma.favoriteLeague.findMany({
          where: { email: { in: smartOwners } },
          select: { email: true, leagueId: true },
        })
      : Promise.resolve([]),
    allFixtureIds.length
      ? prisma.notificationDelivery.findMany({
          where: {
            userId: { in: preferences.map((preference) => preference.userId) },
            fixtureId: { in: allFixtureIds },
          },
          select: { userId: true, fixtureId: true, type: true },
        })
      : Promise.resolve([]),
  ]);
  const favoriteIdsByOwner = new Map<string, Set<number>>();
  for (const favorite of favorites) {
    const ids = favoriteIdsByOwner.get(favorite.email) ?? new Set<number>();
    ids.add(favorite.fixtureId);
    favoriteIdsByOwner.set(favorite.email, ids);
  }
  const favoriteLeaguesByOwner = new Map<string, Set<number>>();
  for (const favorite of favoriteLeagues) {
    const ids = favoriteLeaguesByOwner.get(favorite.email) ?? new Set<number>();
    ids.add(favorite.leagueId);
    favoriteLeaguesByOwner.set(favorite.email, ids);
  }
  const deliveredKeys = new Set(existingDeliveries.map((delivery) =>
    `${delivery.userId}:${delivery.fixtureId}:${delivery.type}`
  ));

  const signals = fixtures.length ? await prisma.marketSignalSnapshot.findMany({
    where: {
      fixtureId: { in: fixtures.map((fixture) => fixture.fixtureId) },
      OR: [
        { market: { in: ["1X2", "OVER_25"] }, policyVersion: MARKET_SIGNAL_POLICY_VERSION },
        { market: { in: ["CORNERS", "CARDS"] }, policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
      ],
    },
  }) : [];
  const signalsByFixture = new Map<number, typeof signals>();
  for (const signal of signals) {
    const rows = signalsByFixture.get(signal.fixtureId) ?? [];
    rows.push(signal);
    signalsByFixture.set(signal.fixtureId, rows);
  }

  let eligible = 0;
  let sent = 0;
  let errors = 0;
  let apiBatches = 0;
  let checkedFixtures = 0;
  let halftimeSent = 0;
  let finalSent = 0;

  const relevantResultIds = new Set<number>();
  for (const preference of preferences) {
    if (!preference.halftimeAndFinal || !preference.user.pushSubscriptions.length) continue;
    const owner = preference.user.email ?? `user:${preference.user.id}`;
    const ids = favoriteIdsByOwner.get(owner) ?? new Set<number>();
    for (const fixture of resultCandidates) {
      if (ids.has(fixture.fixtureId)) relevantResultIds.add(fixture.fixtureId);
    }
  }
  const statusEventsByFixture = new Map<number, ReturnType<typeof matchStatusEvents>>();
  for (const batch of chunkFixtureIds([...relevantResultIds])) {
    apiBatches++;
    try {
      const current = await fetchFixturesByIds(batch);
      checkedFixtures += current.length;
      for (const fixture of current) {
        statusEventsByFixture.set(fixture.fixture.id, matchStatusEvents(fixture));
      }
    } catch {
      errors++;
    }
  }

  async function deliver(
    preference: typeof preferences[number],
    fixture: typeof fixtures[number],
    event: { type: string; title: string; body: string; tag: string },
    url: string
  ) {
    eligible++;
    const key = `${preference.userId}:${fixture.fixtureId}:${event.type}`;
    if (deliveredKeys.has(key)) return;
    let delivered = false;
    for (const subscription of preference.user.pushSubscriptions) {
      try {
        delivered = await sendPushSubscription(subscription, {
          title: event.title, body: event.body, url, tag: event.tag,
        }) || delivered;
      } catch {
        errors++;
      }
    }
    if (!delivered) return;
    await prisma.notificationDelivery.create({
      data: { userId: preference.userId, fixtureId: fixture.fixtureId, type: event.type },
    }).catch(() => {});
    deliveredKeys.add(key);
    sent++;
    if (event.type === "HALFTIME") halftimeSent++;
    if (event.type === "FINAL") finalSent++;
  }

  for (const preference of preferences) {
    if (!preference.user.pushSubscriptions.length) continue;
    const owner = preference.user.email ?? `user:${preference.user.id}`;
    const favoriteIds = favoriteIdsByOwner.get(owner) ?? new Set<number>();
    const favoriteLeagueIds = favoriteLeaguesByOwner.get(owner) ?? new Set<number>();
    for (const fixture of fixtures) {
      const explicitFixtureFavorite = favoriteIds.has(fixture.fixtureId);
      if (!isSmartNotificationTarget({
        explicitFixtureFavorite,
        favoriteLeague: favoriteLeagueIds.has(fixture.leagueId),
        includeFavoriteLeagues: preference.smartFavoriteLeagues,
      })) continue;
      const url = `/porovnani?homeLeague=${fixture.leagueId}&awayLeague=${fixture.leagueId}&home=${fixture.homeTeamId}&away=${fixture.awayTeamId}&fixture=${fixture.fixtureId}`;
      const minutes = Math.round((fixture.kickoff.getTime() - now.getTime()) / 60_000);
      const events: Array<{ type: string; title: string; body: string; tag: string }> = [];
      if (explicitFixtureFavorite && preference.favoriteKickoff && Math.abs(minutes - preference.kickoffMinutes) <= 9) {
        events.push({
          type: `KICKOFF_${preference.kickoffMinutes}`,
          title: `${fixture.homeName} – ${fixture.awayName}`,
          body: `Oblíbený zápas začíná přibližně za ${preference.kickoffMinutes} minut.`,
          tag: `kickoff-${fixture.fixtureId}`,
        });
      }
      if (
        preference.publishedPrediction && fixture.publicationPolicyVersion != null &&
        fixture.published1x2Side && fixture.publishedAt != null &&
        fixture.publishedAt.getTime() >= now.getTime() - 24 * 60 * 60_000
      ) {
        const side = fixture.published1x2Side === "home" ? fixture.homeName : fixture.awayName;
        events.push({
          type: `PUBLISHED_1X2_V${fixture.publicationPolicyVersion}`,
          title: `Nový modelový tip: ${fixture.homeName} – ${fixture.awayName}`,
          body: `${side} · ${fixture.published1x2Prob == null ? "splnil publikační pravidlo" : `${Math.round(fixture.published1x2Prob * 100)} %`}`,
          tag: `published-${fixture.fixtureId}`,
        });
      }
      if (preference.marketMovement) {
        for (const signal of signalsByFixture.get(fixture.fixtureId) ?? []) {
          const points = Array.isArray(signal.series)
            ? signal.series.filter((point): point is { t: number; p: number } => typeof point === "object" && point !== null && typeof (point as { t?: unknown }).t === "number" && typeof (point as { p?: unknown }).p === "number")
            : [];
          if (points.length < 3) continue;
          const current = points.at(-1)!.p;
          const move = current - signal.openMarketProbability;
          if (!isMeaningfulMarketMove({ samples: points.length, open: signal.openMarketProbability, current, model: signal.modelProbability, thresholdPoints: preference.movementThreshold })) continue;
          const label = signal.market === "OVER_25" ? "Góly 2,5" : signal.market === "CORNERS" ? "Rohy" : signal.market === "CARDS" ? "Karty" : "1X2";
          events.push({
            type: `MARKET_MOVE_${signal.market}_P${signal.policyVersion}`,
            title: `Trh se přiblížil modelu · ${label}`,
            body: `${fixture.homeName} – ${fixture.awayName} · posun ${move > 0 ? "+" : ""}${(move * 100).toFixed(1)} p. b.`,
            tag: `market-${fixture.fixtureId}-${signal.market}`,
          });
        }
      }

      for (const event of events) await deliver(preference, fixture, event, `${url}#model-${fixture.fixtureId}`);
    }

    if (preference.halftimeAndFinal) {
      for (const fixture of resultCandidates) {
        if (!favoriteIds.has(fixture.fixtureId)) continue;
        const url = `/porovnani?homeLeague=${fixture.leagueId}&awayLeague=${fixture.leagueId}&home=${fixture.homeTeamId}&away=${fixture.awayTeamId}&fixture=${fixture.fixtureId}`;
        for (const event of statusEventsByFixture.get(fixture.fixtureId) ?? []) {
          await deliver(preference, fixture, event, `${url}#vysledek-analyzy`);
        }
      }
    }
  }
  return { eligible, sent, errors, configured: true, checkedFixtures, apiBatches, halftimeSent, finalSent };
}
