import "server-only";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { prisma } from "@/lib/db";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION, MARKET_SIGNAL_POLICY_VERSION } from "@/lib/picks/marketSignals";
import { isMeaningfulMarketMove, isSmartNotificationTarget } from "@/lib/pushRules";

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

export async function sendKickoffReminders(now = new Date()) {
  if (!pushConfigured()) return { eligible: 0, sent: 0, errors: 0, configured: false };
  const preferences = await prisma.notificationPreference.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true, email: true, pushSubscriptions: true } } },
  });
  if (!preferences.length) return { eligible: 0, sent: 0, errors: 0, configured: true };

  const fixtures = await prisma.fixturePrediction.findMany({
    where: {
      kickoff: {
        gte: new Date(now.getTime() + 5 * 60_000),
        lte: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
      },
    },
    select: {
      fixtureId: true, kickoff: true, homeName: true, awayName: true, leagueId: true,
      homeTeamId: true, awayTeamId: true, published1x2Side: true,
      published1x2Prob: true, publicationPolicyVersion: true,
      publishedAt: true,
    },
  });
  if (!fixtures.length) return { eligible: 0, sent: 0, errors: 0, configured: true };

  const signals = await prisma.marketSignalSnapshot.findMany({
    where: {
      fixtureId: { in: fixtures.map((fixture) => fixture.fixtureId) },
      closedAt: null,
      OR: [
        { market: { in: ["1X2", "OVER_25"] }, policyVersion: MARKET_SIGNAL_POLICY_VERSION },
        { market: { in: ["CORNERS", "CARDS"] }, policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION },
      ],
    },
  });
  const signalsByFixture = new Map<number, typeof signals>();
  for (const signal of signals) {
    const rows = signalsByFixture.get(signal.fixtureId) ?? [];
    rows.push(signal);
    signalsByFixture.set(signal.fixtureId, rows);
  }

  let eligible = 0;
  let sent = 0;
  let errors = 0;
  for (const preference of preferences) {
    if (!preference.user.pushSubscriptions.length) continue;
    const owner = preference.user.email ?? `user:${preference.user.id}`;
    const [favorites, favoriteLeagues] = await Promise.all([
      prisma.favoriteFixture.findMany({
        where: { email: owner, fixtureId: { in: fixtures.map((fixture) => fixture.fixtureId) } },
        select: { fixtureId: true },
      }),
      preference.smartFavoriteLeagues
        ? prisma.favoriteLeague.findMany({
            where: { email: owner },
            select: { leagueId: true },
          })
        : Promise.resolve([]),
    ]);
    const favoriteIds = new Set(favorites.map((favorite) => favorite.fixtureId));
    const favoriteLeagueIds = new Set(favoriteLeagues.map((favorite) => favorite.leagueId));
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

      for (const event of events) {
        eligible++;
        const existing = await prisma.notificationDelivery.findUnique({
          where: { userId_fixtureId_type: { userId: preference.userId, fixtureId: fixture.fixtureId, type: event.type } },
          select: { id: true },
        });
        if (existing) continue;
        let delivered = false;
        for (const subscription of preference.user.pushSubscriptions) {
          try {
            delivered = await sendPushSubscription(subscription, {
              title: event.title,
              body: event.body,
              url,
              tag: event.tag,
            }) || delivered;
          } catch {
            errors++;
          }
        }
        if (delivered) {
          await prisma.notificationDelivery.create({
            data: { userId: preference.userId, fixtureId: fixture.fixtureId, type: event.type },
          }).catch(() => {});
          sent++;
        }
      }
    }
  }
  return { eligible, sent, errors, configured: true };
}
