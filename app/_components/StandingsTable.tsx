import { TeamLogo } from "./TeamLogo";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Hint } from "./Hint";
import type { LeagueStyleKey, LeagueTableRow, LeagueTableZone, RoundFixture } from "@/lib/types";

export interface StandingsTeamInsight {
  style?: { key: LeagueStyleKey; label: string; score: number };
  last?: RoundFixture;
  next?: RoundFixture;
}

/**
 * Sdílený renderer ligové tabulky (vytknuto z `TabulkyApp`, používá i Porovnání).
 * Mobile-first: úzké obrazovky skryjí rozšířené sloupce (V-R-P, forma), stránka
 * nescrolluje vodorovně. `highlightTeamIds` zvýrazní vybrané řádky (oba porovnávané
 * týmy) – `TabulkyApp` ho nepředává (výstup 1:1 jako dřív).
 */
export function StandingsTable({
  rows,
  highlightTeamIds,
  leagueId,
  insights,
  expandable = false,
}: {
  rows: LeagueTableRow[];
  highlightTeamIds?: Set<number>;
  leagueId: number;
  insights?: Map<number, StandingsTeamInsight>;
  expandable?: boolean;
}) {
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
            {/* Zkratky sloupců nesly význam jen v `title=`, který na dotykovém displeji
                nejde vyvolat – a na mobilu je navíc vidět jen `Z / Skóre / +/- / B`,
                takže tabulka zůstala bez klíče právě tam, kde se nejvíc čte. */}
            <Th className="pl-3 text-left">#</Th>
            <Th className="text-left">Tým</Th>
            <Th hint="Odehrané zápasy">Z</Th>
            <Th className="hidden sm:table-cell" hint="Výhry">V</Th>
            <Th className="hidden sm:table-cell" hint="Remízy">R</Th>
            <Th className="hidden sm:table-cell" hint="Prohry">P</Th>
            <Th hint="Vstřelené : obdržené góly">Skóre</Th>
            <Th hint="Rozdíl skóre (vstřelené − obdržené)">+/-</Th>
            <Th className="pr-3" hint="Body" align="end">
              B
            </Th>
            <Th
              className="hidden md:table-cell pr-3"
              hint="Posledních 5 zápasů, nejnovější vpravo. V = výhra, R = remíza, P = prohra."
              align="end"
            >
              Forma
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const highlight = highlightTeamIds?.has(r.teamId) ?? false;
            const expanded = expandable && expandedTeamId === r.teamId;
            const insight = insights?.get(r.teamId);
            return (
              <Fragment key={r.teamId}>
              <tr className={`border-b border-border/60 ${highlight ? "bg-home/5" : ""} ${expandable ? "cursor-pointer hover:bg-background" : ""}`}>
                <td className="py-2 pl-3">
                  <span className="flex items-center gap-1.5">
                    <ZoneBar zone={r.zone} />
                    <span className="w-5 text-right font-semibold tabular-nums text-foreground">
                      {r.rank}
                    </span>
                  </span>
                </td>
                <td className="py-2">
                  {expandable ? <button type="button" onClick={() => setExpandedTeamId(expanded ? null : r.teamId)} aria-expanded={expanded} className="flex w-full items-center gap-2 rounded text-left">
                    <TeamLogo src={r.logoUrl} alt={r.name} size={22} />
                    <span
                      className={`truncate text-foreground ${
                        highlight ? "font-bold" : "font-medium"
                      }`}
                    >
                      {r.name}
                    </span>
                    <span aria-hidden className={`ml-auto text-xs text-muted transition-transform ${expanded ? "rotate-180" : ""}`}>⌄</span>
                  </button> : <Link href={`/tym/${r.teamId}?league=${leagueId}`} className="flex items-center gap-2 rounded transition hover:text-positive">
                    <TeamLogo src={r.logoUrl} alt={r.name} size={22} />
                    <span className={`truncate text-foreground ${highlight ? "font-bold" : "font-medium"}`}>{r.name}</span>
                  </Link>}
                </td>
                <Td>{r.played}</Td>
                <Td className="hidden sm:table-cell">{r.win}</Td>
                <Td className="hidden sm:table-cell">{r.draw}</Td>
                <Td className="hidden sm:table-cell">{r.lose}</Td>
                <Td className="whitespace-nowrap">
                  {r.goalsFor}:{r.goalsAgainst}
                </Td>
                <Td
                  className={
                    r.goalsDiff > 0
                      ? "text-positive"
                      : r.goalsDiff < 0
                        ? "text-negative"
                        : ""
                  }
                >
                  {r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}
                </Td>
                <td className="py-2 pr-3 text-center font-bold tabular-nums text-foreground">
                  {r.points}
                </td>
                <td className="hidden py-2 pr-3 md:table-cell">
                  <FormBadges form={r.form} />
                </td>
              </tr>
              {expanded && (
                <tr className="border-b border-border/60 bg-background/70">
                  <td colSpan={10} className="px-4 py-3">
                    <TeamRowDetail row={r} insight={insight} leagueId={leagueId} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamRowDetail({ row, insight, leagueId }: { row: LeagueTableRow; insight?: StandingsTeamInsight; leagueId: number }) {
  const perMatch = (value: number) => row.played ? (value / row.played).toFixed(2) : "—";
  return <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MiniStat label="Body / zápas" value={row.played ? (row.points / row.played).toFixed(2) : "—"} />
      <MiniStat label="Góly / zápas" value={perMatch(row.goalsFor)} />
      <MiniStat label="Obdržené / zápas" value={perMatch(row.goalsAgainst)} />
      <MiniStat label="Trend formy" value={formTrend(row).label} tone={formTrend(row).tone} />
    </div>
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      {insight?.style && <span className="rounded-full bg-accent/25 px-3 py-1.5 text-xs font-semibold text-foreground">{insight.style.label} · {insight.style.score.toFixed(1)}/10</span>}
      <Link href={`/tym/${row.teamId}?league=${leagueId}`} className="ui-button-secondary min-h-9 px-3 text-xs">Detail týmu</Link>
    </div>
    {(insight?.last || insight?.next) && <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted lg:col-span-2">
      {insight.last && <FixtureBrief label="Naposledy" fixture={insight.last} />}
      {insight.next && <FixtureBrief label="Příště" fixture={insight.next} />}
    </div>}
  </div>;
}

function MiniStat({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return <div><p className="text-[10px] uppercase tracking-wide text-muted">{label}</p><p className={`mt-0.5 font-bold tabular-nums ${tone}`}>{value}</p></div>;
}

function FixtureBrief({ label, fixture }: { label: string; fixture: RoundFixture }) {
  const played = fixture.homeGoals != null && fixture.awayGoals != null;
  return <span><strong className="text-foreground">{label}:</strong> {fixture.home.name} {played ? `${fixture.homeGoals}:${fixture.awayGoals}` : "–"} {fixture.away.name}</span>;
}

function formTrend(row: LeagueTableRow): { label: string; tone: string } {
  const form = row.form;
  if (!form || form.length < 4 || row.played < 4) return { label: "Málo dat", tone: "text-muted" };
  const points = (part: string) => [...part].reduce((sum, result) => sum + (result === "W" ? 3 : result === "D" ? 1 : 0), 0) / part.length;
  const recent = points(form.slice(-5));
  const season = row.points / row.played;
  if (recent > season + 0.4) return { label: "↗ Zlepšuje se", tone: "text-positive" };
  if (recent < season - 0.4) return { label: "↘ Slábne", tone: "text-negative" };
  return { label: "→ Stabilní", tone: "text-muted" };
}

function Th({
  children,
  className = "",
  hint,
  align = "center",
}: {
  children: React.ReactNode;
  className?: string;
  hint?: string;
  /** Zarovnání bubliny – u krajních sloupců jinak přeteče mimo displej. */
  align?: "start" | "center" | "end";
}) {
  return (
    <th className={`px-1.5 py-2 text-center font-medium ${className}`}>
      {hint ? (
        <span className="inline-flex items-center gap-0.5">
          {children}
          <Hint label={String(children)} align={align}>
            {hint}
          </Hint>
        </span>
      ) : (
        children
      )}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-1.5 py-2 text-center tabular-nums text-muted ${className}`}>
      {children}
    </td>
  );
}

const ZONE_META: Record<LeagueTableZone, { bar: string; label: string }> = {
  champions: { bar: "bg-home", label: "Liga mistrů" },
  europa: { bar: "bg-away", label: "Evropská liga" },
  conference: { bar: "bg-positive", label: "Konferenční liga" },
  promotion: { bar: "bg-positive", label: "Postup" },
  relegation: { bar: "bg-negative", label: "Sestup" },
};

function ZoneBar({ zone }: { zone: LeagueTableZone | null }) {
  return (
    <span
      aria-hidden
      className={`h-4 w-1 shrink-0 rounded-full ${zone ? ZONE_META[zone].bar : "bg-transparent"}`}
    />
  );
}

export function ZoneLegend({ rows }: { rows: LeagueTableRow[] }) {
  // Deduplikace podle popisku (KL i postup sdílí barvu, ale jiný text).
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.zone) seen.set(ZONE_META[r.zone].label, ZONE_META[r.zone].bar);
  }
  const hasForm = rows.some((r) => r.form);
  if (seen.size === 0 && !hasForm) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {[...seen.entries()].map(([label, bar]) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-muted">
          <span className={`h-3 w-1 rounded-full ${bar}`} aria-hidden />
          {label}
        </span>
      ))}
      {/* Sloupec Forma je jediné místo, kde se výsledky kódují písmenem i barvou – bez
          klíče to na mobilu (kde je sloupec skrytý až od `md`) nikdo neodvodí. */}
      {hasForm && (
        <span className="hidden items-center gap-1.5 text-xs text-muted md:flex">
          Forma:
          <FormBadge letter="V" /> výhra
          <FormBadge letter="R" /> remíza
          <FormBadge letter="P" /> prohra
        </span>
      )}
    </div>
  );
}

/** Jedno písmeno formy v české notaci (V/R/P) – sdílí ho tabulka i legenda. */
function FormBadge({ letter }: { letter: "V" | "R" | "P" }) {
  const color =
    letter === "V"
      ? "bg-positive/15 text-positive"
      : letter === "P"
        ? "bg-negative/15 text-negative"
        : "bg-border text-muted";
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${color}`}
    >
      {letter}
    </span>
  );
}

/** API vrací W/D/L, nejnovější vpravo. V UI se všude drží české V/R/P. */
function czLetter(c: string): "V" | "R" | "P" {
  return c === "W" ? "V" : c === "L" ? "P" : "R";
}

function FormBadges({ form }: { form: string | null }) {
  if (!form) return <span className="text-xs text-muted">—</span>;
  const letters = form.slice(-5).split("");
  return (
    <span className="flex items-center justify-end gap-0.5">
      {letters.map((c, i) => (
        <FormBadge key={i} letter={czLetter(c)} />
      ))}
    </span>
  );
}
