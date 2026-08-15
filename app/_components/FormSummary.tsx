import Link from "next/link";
import type {
  EntityType,
  FormMatchQuality,
  FormQuality,
  LeagueTable,
  MatchPrediction,
  MatchResult,
  Standing,
  TeamSummary,
  Venue,
} from "@/lib/types";
import {
  buildContextProfile,
  type ContextBadge,
  type ContextProfile,
  type FormState,
} from "@/lib/stats/contextProfile";
import { TeamLogo } from "./TeamLogo";

/**
 * Blok nad metrikami: forma (posl. 5 jako W/D/L), **kvalita formy** (sedí výsledky
 * s výkony?) a podíl čistého konta / zápasů bez gólu (% z posl. 10) pro obě strany.
 * Sleduje přepínač Doma/Venku/Celkově.
 *
 * Kvalita formy je **popisný kontext, ne tip**: pět zápasů je z valné části šum, proto
 * se nikde netváří jako signál a bez xG (reprezentace, část Fortuna ligy) prostě zmizí.
 *
 * Forma se počítá **jen z aktuální sezóny**, takže na jejím startu je prázdná. Prázdný
 * proužek bez vysvětlení vypadá jako rozbité UI, proto se v tu chvíli řekne, čím to je
 * a odkud tedy metriky níž vycházejí.
 */
export function FormSummary({
  home,
  away,
  homeQuality,
  awayQuality,
  homeTeam,
  awayTeam,
  homeStanding,
  awayStanding,
  leagueTable,
  prediction,
  venue,
  mode = "CLUB",
  homeLeagueId,
  awayLeagueId,
  embedded = false,
}: {
  home: TeamSummary | null;
  away: TeamSummary | null;
  homeQuality?: FormQuality | null;
  awayQuality?: FormQuality | null;
  homeTeam: { id: number; name: string; logoUrl: string };
  awayTeam: { id: number; name: string; logoUrl: string };
  homeStanding: Standing | null;
  awayStanding: Standing | null;
  leagueTable: LeagueTable | null;
  prediction: MatchPrediction | null;
  venue: Venue;
  mode?: EntityType;
  homeLeagueId: number | null;
  awayLeagueId: number | null;
  embedded?: boolean;
}) {
  if (!home && !away) return null;

  const showQuality =
    (homeQuality?.xgSampleSize ?? 0) > 0 || (awayQuality?.xgSampleSize ?? 0) > 0;
  const homeProfile = buildContextProfile({
    teamId: homeTeam.id,
    side: "home",
    venue,
    summary: home,
    quality: homeQuality ?? null,
    standing: homeStanding,
    leagueTable: mode === "CLUB" ? leagueTable : null,
    prediction,
  });
  const awayProfile = buildContextProfile({
    teamId: awayTeam.id,
    side: "away",
    venue,
    summary: away,
    quality: awayQuality ?? null,
    standing: awayStanding,
    leagueTable: mode === "CLUB" ? leagueTable : null,
    prediction,
  });
  // Reprezentace mají časová okna, ne sezónní baseline – u nich prázdná forma znamená
  // „žádné zápasy", ne „sezóna ještě nezačala", takže se hláška netýká jich.
  const seasonNotStarted =
    mode === "CLUB" &&
    (home?.form.length ?? 0) === 0 &&
    (away?.form.length ?? 0) === 0;

  return (
    <section className={embedded ? "" : "rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6"}>
      {seasonNotStarted && (
        <p className="mb-3 rounded-lg bg-background px-3 py-2 text-[11px] text-muted">
          ℹ Nová sezóna zatím nemá odehrané zápasy – forma je prázdná schválně. Metriky
          níž proto vycházejí z okna <strong>Minulá sezóna</strong>.
        </p>
      )}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 border-b border-border pb-4">
          <ProfileHeader team={homeTeam} leagueId={homeLeagueId} badges={homeProfile.badges} state={homeProfile.formState} accent="home" />
          <ProfileHeader team={awayTeam} leagueId={awayLeagueId} badges={awayProfile.badges} state={awayProfile.formState} accent="away" alignRight />
        </div>
        <Row label="Forma">
          <FormBadges
            form={home?.form ?? []}
            team={homeTeam}
            opponents={home?.formOpponents ?? []}
            quality={homeQuality?.matches ?? []}
            align="left"
          />
          <FormBadges
            form={away?.form ?? []}
            team={awayTeam}
            opponents={away?.formOpponents ?? []}
            quality={awayQuality?.matches ?? []}
            align="right"
          />
        </Row>
        <Row label="Posledních 5">
          <RecentValue profile={homeProfile} accent="home" />
          <RecentValue profile={awayProfile} accent="away" alignRight />
        </Row>
        {showQuality && (
          <Row label="xG trend">
            <XgTrend profile={homeProfile} q={homeQuality ?? null} accent="home" />
            <XgTrend profile={awayProfile} q={awayQuality ?? null} accent="away" alignRight />
          </Row>
        )}
        {mode === "CLUB" &&
          (homeProfile.pointsPerGame != null || awayProfile.pointsPerGame != null) && (
            <Row label="Body na zápas">
              <NumberValue value={homeProfile.pointsPerGame} accent="home" suffix=" b." />
              <NumberValue value={awayProfile.pointsPerGame} accent="away" suffix=" b." alignRight />
            </Row>
          )}
        <Pct
          label="Čisté konto"
          home={home?.cleanSheetPct ?? null}
          away={away?.cleanSheetPct ?? null}
          homeN={home?.sampleSize ?? 0}
          awayN={away?.sampleSize ?? 0}
          higherIsBetter
        />
        <Pct
          label="Bez vstřeleného gólu"
          home={home?.failedToScorePct ?? null}
          away={away?.failedToScorePct ?? null}
          homeN={home?.sampleSize ?? 0}
          awayN={away?.sampleSize ?? 0}
          higherIsBetter={false}
        />
      </div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: [React.ReactNode, React.ReactNode];
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 justify-start">{children[0]}</div>
      <span className="shrink-0 px-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="flex flex-1 justify-end">{children[1]}</div>
    </div>
  );
}

const PROFILE_BADGE_TONE: Record<ContextBadge["tone"], string> = {
  positive: "border-positive/20 bg-positive/10 text-positive",
  warning: "border-warning/25 bg-warning/10 text-warning",
  info: "border-home/20 bg-home/10 text-home",
};

function ProfileHeader({
  team,
  leagueId,
  badges,
  state,
  accent,
  alignRight,
}: {
  team: { id: number; name: string; logoUrl: string };
  leagueId: number | null;
  badges: ContextBadge[];
  state: FormState;
  accent: "home" | "away";
  alignRight?: boolean;
}) {
  const color = accent === "home" ? "text-home" : "text-away";
  const href = leagueId == null ? null : `/tym/${team.id}?league=${leagueId}#recent-performances-title`;
  return (
    <div className={alignRight ? "min-w-0 text-right" : "min-w-0 text-left"}>
      {href ? (
        <Link
          href={href}
          aria-label={`Otevřít poslední výkony týmu ${team.name}`}
          className={`flex min-h-9 items-center gap-2 rounded-lg outline-none transition hover:bg-background focus-visible:ring-2 focus-visible:ring-accent-strong ${alignRight ? "justify-end" : "justify-start"}`}
        >
          {!alignRight && <TeamLogo src={team.logoUrl} alt={team.name} size={24} />}
          <span className={`truncate text-sm font-bold ${color}`}>{team.name}</span>
          {alignRight && <TeamLogo src={team.logoUrl} alt={team.name} size={24} />}
        </Link>
      ) : (
        <div className={`flex items-center gap-2 ${alignRight ? "justify-end" : "justify-start"}`}>
          {!alignRight && <TeamLogo src={team.logoUrl} alt={team.name} size={24} />}
          <span className={`truncate text-sm font-bold ${color}`}>{team.name}</span>
          {alignRight && <TeamLogo src={team.logoUrl} alt={team.name} size={24} />}
        </div>
      )}
      <FormStateView state={state} alignRight={alignRight} />
      {badges.length > 0 ? (
        <div className={`mt-2 flex flex-wrap gap-1.5 ${alignRight ? "justify-end" : "justify-start"}`}>
          {badges.map((badge) => (
            <span
              key={badge.id}
              title={badge.description}
              className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PROFILE_BADGE_TONE[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-muted">Bez výrazného signálu</p>
      )}
      {href && (
        <Link
          href={href}
          className={`mt-2 inline-flex min-h-9 items-center rounded-lg px-2 text-[11px] font-semibold text-muted outline-none transition hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-strong ${alignRight ? "justify-end" : "justify-start"}`}
        >
          Poslední výkony →
        </Link>
      )}
    </div>
  );
}

const FORM_STATE_TONE: Record<FormState["tone"], string> = {
  positive: "border-positive/25 bg-positive/10 text-positive",
  info: "border-home/20 bg-home/10 text-home",
  warning: "border-warning/25 bg-warning/10 text-warning",
  negative: "border-negative/25 bg-negative/10 text-negative",
  muted: "border-border bg-background text-muted",
};

function FormStateView({ state, alignRight }: { state: FormState; alignRight?: boolean }) {
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2 ${FORM_STATE_TONE[state.tone]} ${alignRight ? "text-right" : "text-left"}`}>
      <p className="text-xs font-extrabold">
        {state.label}{state.score == null ? "" : ` · ${state.score.toFixed(1)}/10`}
      </p>
      <p className="mt-0.5 text-[10px] opacity-80">
        {state.reasons.join(" · ")}{state.sampleSize > 0 ? ` · vzorek ${state.sampleSize}` : ""}
      </p>
    </div>
  );
}

function RecentValue({
  profile,
  accent,
  alignRight,
}: {
  profile: ContextProfile;
  accent: "home" | "away";
  alignRight?: boolean;
}) {
  if (profile.recent.sampleSize === 0) return <span className="text-sm text-muted">—</span>;
  const color = accent === "home" ? "text-home" : "text-away";
  const hasScore = profile.recent.goalsFor != null && profile.recent.goalsAgainst != null;
  return (
    <div className={alignRight ? "text-right" : "text-left"}>
      <span className={`text-sm font-bold tabular-nums ${color}`}>
        {profile.recent.points}/{profile.recent.maximum} b.
      </span>
      {hasScore && (
        <span className="ml-1.5 text-xs tabular-nums text-muted">
          skóre {profile.recent.goalsFor}:{profile.recent.goalsAgainst}
        </span>
      )}
    </div>
  );
}

function NumberValue({
  value,
  accent,
  suffix,
  alignRight,
}: {
  value: number | null;
  accent: "home" | "away";
  suffix?: string;
  alignRight?: boolean;
}) {
  const color = accent === "home" ? "text-home" : "text-away";
  return (
    <span className={`text-sm font-bold tabular-nums ${alignRight ? "text-right" : "text-left"} ${value == null ? "text-muted" : color}`}>
      {value == null ? "—" : `${value.toFixed(2)}${suffix ?? ""}`}
    </span>
  );
}

const BADGE: Record<MatchResult, string> = {
  W: "bg-positive text-white",
  D: "bg-muted/30 text-foreground",
  L: "bg-red-500 text-white",
};

/**
 * API i typ `MatchResult` jedou v angličtině (W/D/L), UI je celé česky. Ligová tabulka
 * (`StandingsTable`) tiskla V/R/P, tenhle proužek W/D/L – stejný pojem dvěma abecedami
 * na dvou obrazovkách. Překlad je proto tady, u vykreslení.
 */
const CZ_RESULT: Record<MatchResult, string> = { W: "V", D: "R", L: "P" };

type FormOpponent = { id: number; name: string; logoUrl: string | null } | null;

/**
 * Proužek pod badgem = jak výsledek seděl s výkonem. Barvy jsou z pohledu „co ti to
 * říká o týmu": **štěstí = varování** (body nad výkonem se dlouhodobě neudrží),
 * **smůla = pozitivum** (tým hraje líp, než ukazuje tabulka).
 */
const MARK: Record<NonNullable<FormMatchQuality["verdict"]>, string> = {
  lucky: "bg-warning",
  unlucky: "bg-positive",
  matched: "bg-muted/25",
};

const VERDICT_LABEL: Record<NonNullable<FormMatchQuality["verdict"]>, string> = {
  lucky: "víc bodů, než výkon zasloužil",
  unlucky: "míň bodů, než výkon zasloužil",
  matched: "výsledek sedí s výkonem",
};

/** Tooltip zápasu: soupeř, skóre a čísla, ze kterých hodnocení vzniklo. */
function matchTitle(teamName: string, opponent: FormOpponent, q: FormMatchQuality | null): string {
  const parts: string[] = [];
  if (opponent) parts.push(opponent.name);
  if (q) {
    parts.push(`${q.goalsFor}:${q.goalsAgainst}`);
    if (q.xgFor != null && q.xgAgainst != null) {
      parts.push(`xG ${teamName} ${q.xgFor.toFixed(2)} : ${opponent?.name ?? "soupeř"} ${q.xgAgainst.toFixed(2)}`);
      parts.push(`xB ${q.expectedPoints!.toFixed(1)} vs ${q.points} b.`);
      parts.push(VERDICT_LABEL[q.verdict!]);
    }
  }
  return parts.join(" · ");
}

function FormBadges({
  form,
  team,
  opponents,
  quality,
  align,
}: {
  form: MatchResult[];
  team: { name: string; logoUrl: string };
  opponents: FormOpponent[];
  quality: FormMatchQuality[];
  align: "left" | "right";
}) {
  if (form.length === 0) {
    return <span className="text-sm text-muted">—</span>;
  }
  // Nejnovější první; pro hosty zarovnáme doprava (nejnovější u kraje).
  // `quality` je nad TÝMIŽ zápasy ve stejném pořadí (viz `orderedMatches`) → index sedí.
  const paired = form.map((r, i) => ({
    r,
    opponent: opponents[i] ?? null,
    q: quality[i] ?? null,
  }));
  const ordered = align === "right" ? [...paired].reverse() : paired;
  const anyMark = quality.some((q) => q.verdict != null);
  return (
    <div className="flex gap-1">
      {ordered.map(({ r, opponent, q }, i) => (
        <details
          key={i}
          className="group relative"
        >
          <summary
            title={matchTitle(team.name, opponent, q)}
            aria-label={`${CZ_RESULT[r]}${opponent ? ` proti ${opponent.name}` : ""}. Zobrazit detail zápasu`}
            className="flex min-h-11 min-w-8 cursor-pointer list-none flex-col items-center justify-center gap-0.5 rounded-md outline-none transition hover:bg-background focus-visible:ring-2 focus-visible:ring-accent-strong [&::-webkit-details-marker]:hidden"
          >
            <span
              aria-hidden="true"
              className="flex h-3 items-center justify-center"
            >
              {opponent && <TeamLogo src={opponent.logoUrl ?? undefined} alt="" size={12} />}
            </span>
            <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${BADGE[r]}`}>
              {CZ_RESULT[r]}
            </span>
            {anyMark && (
              <span className={`h-[3px] w-5 rounded-full ${q?.verdict ? MARK[q.verdict] : "bg-transparent"}`} />
            )}
          </summary>
          <div
            className={`absolute top-full z-30 mt-1 w-52 rounded-xl border border-border bg-surface p-3 text-left shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
          >
            {q ? (
              <div className="mt-2 space-y-1 text-[11px] text-muted">
                <div className="space-y-1.5">
                  <TeamPerformanceSide
                    name={team.name}
                    logoUrl={team.logoUrl}
                    role={roleLabel(q, true)}
                    goals={q.goalsFor}
                    xg={q.xgFor}
                  />
                  <TeamPerformanceSide
                    name={opponent?.name ?? "Neznámý soupeř"}
                    logoUrl={opponent?.logoUrl ?? null}
                    role={roleLabel(q, false)}
                    goals={q.goalsAgainst}
                    xg={q.xgAgainst}
                  />
                </div>
                {q.xgFor != null && q.xgAgainst != null ? (
                  <>
                    <p>xB <strong className="text-foreground">{q.expectedPoints?.toFixed(1) ?? "—"}</strong> · {q.points} b.</p>
                    {q.verdict && <p className="border-t border-border pt-1.5">{VERDICT_LABEL[q.verdict]}</p>}
                  </>
                ) : (
                  <p>Bez dostupného xG hodnocení.</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted">Detail výkonu zatím není v cache dostupný.</p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

const LEVEL_LABEL: Record<NonNullable<FormQuality["level"]>, string> = {
  overperforming: "nadstavená forma",
  underperforming: "podhodnocená forma",
  inline: "sedí",
};

const LEVEL_COLOR: Record<NonNullable<FormQuality["level"]>, string> = {
  overperforming: "text-warning",
  underperforming: "text-positive",
  inline: "text-muted",
};

/** xG rozdíl na zápas; skutečné a očekávané body zůstávají jako vysvětlující detail. */
function XgTrend({
  profile,
  q,
  accent,
  alignRight,
}: {
  profile: ContextProfile;
  q: FormQuality | null;
  accent: "home" | "away";
  alignRight?: boolean;
}) {
  if (profile.xgDiffPerMatch == null || !q || q.points == null || q.expectedPoints == null) {
    return <span className="text-sm text-muted">—</span>;
  }
  const color = accent === "home" ? "text-home" : "text-away";
  const signed = profile.xgDiffPerMatch > 0
    ? `+${profile.xgDiffPerMatch.toFixed(2)}`
    : profile.xgDiffPerMatch.toFixed(2);
  return (
    <div className={alignRight ? "text-right" : "text-left"} title={q.note || undefined}>
      <div>
        <span className={`text-sm font-bold tabular-nums ${color}`}>
          {signed} xG/záp.
        </span>
      </div>
      <div className="text-[10px] tabular-nums text-muted">
        {q.points} b. / xB {q.expectedPoints.toFixed(1)} · {q.xgSampleSize} záp.
        {q.level && <span className={`ml-1 font-medium ${LEVEL_COLOR[q.level]}`}>· {LEVEL_LABEL[q.level]}</span>}
      </div>
    </div>
  );
}

function roleLabel(q: FormMatchQuality, ownTeam: boolean): string | null {
  if (q.isNeutral) return "neutrální půda";
  if (q.isHome == null) return null;
  const home = ownTeam ? q.isHome : !q.isHome;
  return home ? "domácí" : "hosté";
}

function TeamPerformanceSide({
  name,
  logoUrl,
  role,
  goals,
  xg,
}: {
  name: string;
  logoUrl: string | null;
  role: string | null;
  goals: number;
  xg: number | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-background px-2 py-1.5">
      <TeamLogo src={logoUrl ?? undefined} alt={name} size={18} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-foreground">{name}</p>
        {role && <p className="text-[9px] uppercase tracking-wide text-muted">{role}</p>}
      </div>
      <div className="text-right tabular-nums">
        <p className="font-bold text-foreground">{goals} gólů</p>
        <p>xG {xg == null ? "—" : xg.toFixed(2)}</p>
      </div>
    </div>
  );
}

function Pct({
  label,
  home,
  away,
  homeN,
  awayN,
  higherIsBetter,
}: {
  label: string;
  home: number | null;
  away: number | null;
  homeN: number;
  awayN: number;
  higherIsBetter: boolean;
}) {
  const better =
    home == null || away == null
      ? null
      : home === away
        ? null
        : (higherIsBetter ? home > away : home < away)
          ? "home"
          : "away";

  return (
    <Row label={label}>
      <PctValue value={home} n={homeN} accent="home" highlight={better === "home"} />
      <PctValue
        value={away}
        n={awayN}
        accent="away"
        highlight={better === "away"}
        alignRight
      />
    </Row>
  );
}

function PctValue({
  value,
  n,
  accent,
  highlight,
  alignRight,
}: {
  value: number | null;
  n: number;
  accent: "home" | "away";
  highlight?: boolean;
  alignRight?: boolean;
}) {
  const color = accent === "home" ? "text-home" : "text-away";
  return (
    <div className={alignRight ? "text-right" : "text-left"}>
      <span
        className={`text-sm font-bold tabular-nums ${
          highlight ? color : "text-foreground"
        }`}
      >
        {value == null ? "—" : `${value} %`}
      </span>
      {n > 0 && (
        <span className="ml-1 text-[10px] text-muted">z {n} záp.</span>
      )}
    </div>
  );
}
