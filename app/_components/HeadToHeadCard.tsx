"use client";

import Image from "next/image";
import type { HeadToHeadSummary } from "@/lib/h2h";

export function HeadToHeadCard({
  summary,
  teamAName,
  teamBName,
  compact = false,
}: {
  summary: HeadToHeadSummary;
  teamAName: string;
  teamBName: string;
  compact?: boolean;
}) {
  if (!summary.sample) {
    return <section className="rounded-xl border border-border bg-surface px-3 py-3 text-xs text-muted" aria-label="Vzájemné zápasy">
      <strong className="text-foreground">Vzájemné zápasy</strong>
      <p className="mt-1">V uložené historii zatím nemáme společný zápas těchto týmů.</p>
    </section>;
  }
  const shown = summary.meetings.slice(0, compact ? 5 : 10);
  const pct = (value: number) => `${Math.round(value / summary.sample * 100)} %`;
  return <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5" aria-labelledby={compact ? undefined : "h2h-heading"}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="page-kicker">Vzájemné zápasy</p>
        <h2 id={compact ? undefined : "h2h-heading"} className={`${compact ? "text-sm" : "mt-1 text-lg"} font-bold text-foreground`}>
          Posledních {summary.sample} utkání
        </h2>
      </div>
      <div className="flex gap-1.5">
        {summary.confidence === "limited" && <H2HBadge>Omezený vzorek</H2HBadge>}
        {summary.olderHistory && <H2HBadge>Starší historie</H2HBadge>}
      </div>
    </div>
    <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl border border-border text-center tabular-nums">
      <Stat value={summary.teamAWins} label={teamAName} tone="home" />
      <Stat value={summary.draws} label="Remízy" />
      <Stat value={summary.teamBWins} label={teamBName} tone="away" />
    </div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span>Góly <b className="text-foreground">{summary.goalsA}:{summary.goalsB}</b></span>
      <span>Over 2,5 <b className="text-foreground">{summary.over25}/{summary.sample} · {pct(summary.over25)}</b></span>
      <span>Oba skórují <b className="text-foreground">{summary.btts}/{summary.sample} · {pct(summary.btts)}</b></span>
      {summary.advancedSample > 0 && <span>xG <b className="text-foreground">{summary.xgA?.toFixed(2)}:{summary.xgB?.toFixed(2)}</b> · {summary.advancedSample} záp.</span>}
    </div>
    {!compact && <div className="mt-4 divide-y divide-border border-y border-border">
      {shown.map((meeting) => <div key={meeting.fixtureId} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 py-2.5 text-xs">
        <time className="text-muted" dateTime={meeting.date}>{new Date(meeting.date).toLocaleDateString("cs-CZ")}</time>
        <div className="min-w-0 space-y-1">
          <TeamLine team={meeting.home} role="domácí" />
          <TeamLine team={meeting.away} role="hosté" />
        </div>
        <div className="text-right font-bold tabular-nums text-foreground">
          <div>{meeting.home.goals ?? "–"}</div><div>{meeting.away.goals ?? "–"}</div>
        </div>
      </div>)}
    </div>}
    <p className="mt-3 text-[10px] leading-4 text-muted">Bilance se hodnotí po 90 minutách a slouží jako historický kontext. Sama nemění modelovou predikci.</p>
  </section>;
}

function TeamLine({ team, role }: { team: HeadToHeadSummary["meetings"][number]["home"]; role: string }) {
  return <div className="flex min-w-0 items-center gap-2">
    {team.logoUrl ? <Image src={team.logoUrl} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" /> : <span className="h-[18px] w-[18px]" />}
    <span className="truncate font-medium text-foreground">{team.name}</span>
    <small className="text-muted">{role}{team.xg != null ? ` · xG ${team.xg.toFixed(2)}` : ""}</small>
  </div>;
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "home" | "away" }) {
  return <div className="min-w-0 border-r border-border px-2 py-2.5 last:border-r-0">
    <strong className={`block text-lg ${tone === "home" ? "text-info" : tone === "away" ? "text-warning" : "text-foreground"}`}>{value}</strong>
    <span className="block truncate text-[10px] text-muted" title={label}>{label}</span>
  </div>;
}

function H2HBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-background px-2 py-1 text-[10px] font-semibold text-muted">{children}</span>;
}
