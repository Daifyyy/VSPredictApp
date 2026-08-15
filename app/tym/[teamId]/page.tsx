import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/app/_components/AppHeader";
import { InjuryList } from "@/app/_components/InjuryList";
import { TeamLogo } from "@/app/_components/TeamLogo";
import { StadiumCard } from "@/app/_components/StadiumCard";
import { getCurrentUser } from "@/lib/authUser";
import { loadTeamProfile } from "@/lib/data/teamProfile";
import { getEntitlement } from "@/lib/entitlements";
import { METRIC_HINTS, METRIC_LABELS, type Metric, type Venue } from "@/lib/types";
import { describeTeamStyle } from "@/lib/teamProfile";
import type { SessionUser } from "@/app/_components/sessionUser";

const VENUES: { value: Venue; label: string }[] = [
  { value: "TOTAL", label: "Celkem" },
  { value: "HOME", label: "Doma" },
  { value: "AWAY", label: "Venku" },
];

const GROUPS: { title: string; metrics: Metric[] }[] = [
  { title: "Útok a šance", metrics: ["GOALS_FOR", "XG", "SHOTS", "SHOTS_ON_TARGET"] },
  { title: "Obrana", metrics: ["GOALS_AGAINST", "XG_AGAINST", "SAVES"] },
  { title: "Výstavba hry", metrics: ["POSSESSION", "PASSES_TOTAL", "PASS_ACCURACY", "SHOTS_INSIDE_BOX", "SHOTS_OUTSIDE_BOX"] },
  { title: "Standardky a disciplína", metrics: ["CORNERS", "OFFSIDES", "FOULS", "YELLOW_CARDS", "RED_CARDS"] },
];

type Props = {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ league?: string; venue?: string }>;
};

function venueOf(value: string | undefined): Venue {
  return value === "HOME" || value === "AWAY" ? value : "TOTAL";
}

async function resolveProfile(props: Props, includePro: boolean) {
  const [{ teamId: rawTeamId }, search] = await Promise.all([props.params, props.searchParams]);
  const teamId = Number(rawTeamId);
  const leagueId = Number(search.league);
  if (!Number.isFinite(teamId) || !Number.isFinite(leagueId)) return null;
  return loadTeamProfile(teamId, leagueId, includePro);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const profile = await resolveProfile(props, false).catch(() => null);
  if (!profile) return { title: "Tým nenalezen" };
  return {
    title: `${profile.team.name} – statistiky a herní styl`,
    description: `Forma, výkonnost doma a venku, herní styl a klíčové statistiky týmu ${profile.team.name}.`,
  };
}

export default async function TeamPage(props: Props) {
  const currentUser = await getCurrentUser();
  const entitlement = getEntitlement(currentUser ? { tier: currentUser.tier, proTrialUsed: currentUser.proTrialUsed } : null);
  const profile = await resolveProfile(props, entitlement.pro).catch(() => null);
  if (!profile) notFound();
  const search = await props.searchParams;
  const venue = venueOf(search.venue);
  const leagueId = profile.team.leagueId;
  const summary = profile.summaries.find((item) => item.venue === venue) ?? null;
  const quality = profile.formQuality.find((item) => item.venue === venue) ?? null;
  const values = new Map(profile.values.filter((item) => item.venue === venue).map((item) => [item.metric, item]));
  const user: SessionUser | null = currentUser ? {
    id: currentUser.id,
    name: currentUser.name,
    image: currentUser.image,
    tier: currentUser.tier,
    proTrialUsed: currentUser.proTrialUsed,
  } : null;

  return (
    <main className="app-page">
      <AppHeader user={user} share />
      <header className="ui-panel mt-6 p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-border bg-background"><TeamLogo src={profile.team.logoUrl} alt={profile.team.name} size={56} /></div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-muted">Profil týmu</p>
              <h1 className="mt-1 truncate text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{profile.team.name}</h1>
              <p className="mt-1 text-sm text-muted">{profile.team.country}{profile.standing ? ` · ${profile.standing.rank}. místo · ${profile.standing.points} bodů` : ""}</p>
            </div>
          </div>
          <Link href={`/porovnani?homeLeague=${leagueId}&home=${profile.team.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-positive px-4 text-sm font-semibold text-white">Porovnat tým</Link>
        </div>
      </header>

      {profile.team.stadium && (profile.team.stadium.name || profile.team.stadium.imageUrl || profile.team.stadium.capacity) ? <StadiumCard stadium={profile.team.stadium} /> : null}

      <nav aria-label="Místo výkonu" className="mt-4 inline-flex rounded-xl border border-border bg-surface p-1">
        {VENUES.map((item) => <Link key={item.value} href={`/tym/${profile.team.id}?league=${leagueId}&venue=${item.value}`} aria-current={venue === item.value ? "page" : undefined} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold ${venue === item.value ? "bg-accent/35 text-foreground ring-1 ring-accent-strong/20" : "text-muted hover:text-foreground"}`}>{item.label}</Link>)}
      </nav>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormCard form={summary?.form ?? []} sample={summary?.formSampleSize ?? 0} />
        <StatCard label="Čistá konta" value={summary?.cleanSheetPct != null ? `${Math.round(summary.cleanSheetPct)} %` : "—"} note={`z ${summary?.sampleSize ?? 0} zápasů`} />
        <StatCard label="Body vs. výkon" value={quality?.points != null ? `${quality.points} b.` : "—"} note={quality?.expectedPoints != null ? `xB ${quality.expectedPoints.toFixed(1)}` : "bez dostatečných xG dat"} />
        <StatCard label="Skóre v tabulce" value={profile.standing ? `${profile.standing.all.goalsFor}:${profile.standing.all.goalsAgainst}` : "—"} note={profile.standing ? `${profile.standing.all.played} utkání` : "tabulka není dostupná"} />
      </section>

      <RecentPerformances
        matches={quality?.matches ?? []}
        opponents={summary?.formOpponents ?? []}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <section className="ui-panel p-5">
          <h2 className="text-lg font-bold text-foreground">Herní profil</h2>
          <div className="mt-4 space-y-4">
            {profile.styles[venue].map(({ key, ...item }) => <StyleBar key={key} {...item} />)}
          </div>
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            {entitlement.pro ? describeTeamStyle(profile, venue).map((text) => <p key={text} className="text-sm leading-6 text-muted">{text}</p>) : <p className="text-sm text-muted">Komplexní interpretace stylu a absencí je dostupná v PRO. Základní hodnoty zůstávají veřejné.</p>}
          </div>
          <p className="mt-4 rounded-lg bg-background px-3 py-2 text-[11px] leading-5 text-muted">Aktivita bez míče je orientační proxy z dostupných zápasových statistik. Přesnou výšku obranného bloku bez pozičních dat a PPDA neurčujeme.</p>
        </section>

        <section className="ui-panel overflow-hidden p-5">
          <h2 className="text-lg font-bold text-foreground">Statistická výkonnost</h2>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {GROUPS.map((group) => <div key={group.title}><h3 className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-muted">{group.title}</h3><div className="divide-y divide-border">{group.metrics.map((metric) => { const item = values.get(metric); return <div key={metric} title={METRIC_HINTS[metric]} className="flex min-h-10 items-center justify-between gap-3 text-sm"><span className="text-muted">{METRIC_LABELS[metric]}</span><span className="font-bold tabular-nums text-foreground">{item?.value != null ? item.value.toFixed(1) : "—"}{item?.lowConfidence ? " *" : ""}</span></div>; })}</div></div>)}
          </div>
        </section>
      </div>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <SimpleList title="Nejlepší střelci" empty={profile.availability.scorers ? "Střelci nejsou dostupní." : "Zdroj střelců se nepodařilo načíst."} items={profile.scorers.map((item) => `${item.name} · ${item.goals} gólů`)} />
        {entitlement.pro ? (profile.injuries && profile.injuries.length > 0 ? <InjuryList title={profile.team.name} accent="home" injuries={profile.injuries} /> : <SimpleList title="Absence" empty={profile.availability.injuries ? "Nejsou evidované aktuální absence." : "Data absencí nejsou dostupná."} items={[]} />) : <SimpleList title="Absence · PRO" empty="Přihlas se s PRO účtem pro aktuální stav kádru." items={[]} />}
        <SimpleList title="Přestupy" empty={profile.availability.transfers ? "Nejsou evidované aktuální přestupy." : "Zdroj přestupů se nepodařilo načíst."} items={profile.transfers.slice(0, 8).map((item) => `${item.playerName} · ${item.inTeamId === profile.team.id ? "příchod" : "odchod"}`)} />
      </section>
    </main>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) { return <article className="data-card p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></article>; }

function FormCard({ form, sample }: { form: ("W" | "D" | "L")[]; sample: number }) {
  const labels = { W: "V", D: "R", L: "P" } as const;
  const colors = { W: "bg-positive text-white", D: "bg-muted/25 text-foreground", L: "bg-negative text-white" } as const;
  return <article className="data-card p-4"><p className="text-xs font-semibold text-muted">Forma</p><div className="mt-3 flex min-h-8 gap-1.5">{form.length ? form.map((result, index) => <span key={`${result}-${index}`} className={`grid h-8 min-w-8 place-items-center rounded-md px-2 text-xs font-bold ${colors[result]}`} title={result === "W" ? "Výhra" : result === "D" ? "Remíza" : "Prohra"}>{labels[result]}</span>) : <span className="text-2xl font-bold text-foreground">—</span>}</div><p className="mt-2 text-xs text-muted">posledních {sample} zápasů</p></article>;
}

function RecentPerformances({
  matches,
  opponents,
}: {
  matches: import("@/lib/types").FormMatchQuality[];
  opponents: ({ id: number; name: string; logoUrl: string | null } | null)[];
}) {
  const resultLabel = { W: "V", D: "R", L: "P" } as const;
  const resultTone = { W: "bg-positive text-white", D: "bg-muted/20 text-foreground", L: "bg-negative text-white" } as const;
  const number = (value: number | null | undefined, digits = 0) => value == null ? "—" : value.toFixed(digits);
  return (
    <section className="ui-panel mt-4 overflow-hidden" aria-labelledby="recent-performances-title">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 id="recent-performances-title" className="text-lg font-bold text-foreground">Poslední výkony</h2>
        <p className="mt-1 text-xs text-muted">Všechny údaje jsou načtené společně s profilem. Řádky nic dalšího nestahují.</p>
      </div>
      {matches.length ? <div className="divide-y divide-border">
        {matches.map((match, index) => {
          const opponent = opponents[index];
          const verdict = match.verdict === "lucky" ? "Výsledek nad výkonem" : match.verdict === "unlucky" ? "Výkon nad výsledkem" : match.verdict === "matched" ? "Výsledek odpovídá výkonu" : "Bez xG hodnocení";
          return <article key={match.fixtureId} className="grid grid-cols-3 gap-3 px-4 py-3 sm:grid-cols-[minmax(190px,1.4fr)_repeat(5,minmax(64px,.55fr))] sm:items-center sm:px-5">
            <div className="col-span-3 flex min-w-0 items-center gap-3 sm:col-span-1">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-bold ${resultTone[match.result]}`}>{resultLabel[match.result]}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{opponent?.name ?? "Neznámý soupeř"}</p>
                <p className="text-[11px] text-muted">{new Date(match.date).toLocaleDateString("cs-CZ")} · {verdict}</p>
              </div>
            </div>
            <PerformanceValue label="Skóre" value={`${match.goalsFor}:${match.goalsAgainst}`} />
            <PerformanceValue label="xG" value={match.xgFor == null || match.xgAgainst == null ? "—" : `${number(match.xgFor, 2)}:${number(match.xgAgainst, 2)}`} />
            <PerformanceValue label="Střely" value={number(match.shots)} />
            <PerformanceValue label="Na branku" value={number(match.shotsOnTarget)} />
            <PerformanceValue label="Držení" value={match.possession == null ? "—" : `${number(match.possession)} %`} />
            <div className="col-span-full flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted sm:justify-end">
              <span>Rohy <b className="text-foreground">{number(match.corners)}</b></span>
              <span>Karty <b className="text-foreground">{number(match.cards)}</b></span>
              {match.expectedPoints != null && <span>xB <b className="text-foreground">{number(match.expectedPoints, 2)}</b></span>}
            </div>
          </article>;
        })}
      </div> : <p className="px-5 py-5 text-sm text-muted">Detailní výkony zatím nejsou v cache dostupné.</p>}
    </section>
  );
}

function PerformanceValue({ label, value }: { label: string; value: string }) {
  return <div className="text-left sm:text-right"><p className="text-[10px] uppercase tracking-wide text-muted">{label}</p><p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{value}</p></div>;
}

function StyleBar({ label, leftLabel, rightLabel, score, available }: { label: string; leftLabel: string; rightLabel: string; score: number; available: boolean }) { return <div><div className="flex items-center justify-between text-xs"><span className="font-semibold text-foreground">{label}</span><span className="font-bold tabular-nums text-positive">{available ? `${score.toFixed(1)}/10` : "—"}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-border"><div className="bar-fill h-full rounded-full bg-positive" style={{ width: available ? `${score * 10}%` : "0%" }} /></div><div className="mt-1 flex justify-between text-[10px] text-muted"><span>{leftLabel}</span><span>{rightLabel}</span></div></div>; }

function SimpleList({ title, items, empty }: { title: string; items: string[]; empty: string }) { return <section className="ui-panel p-4"><h2 className="text-sm font-bold text-foreground">{title}</h2>{items.length > 0 ? <ul className="mt-3 divide-y divide-border text-sm">{items.map((item) => <li key={item} className="py-2 text-muted">{item}</li>)}</ul> : <p className="mt-3 text-sm leading-6 text-muted">{empty}</p>}</section>; }
