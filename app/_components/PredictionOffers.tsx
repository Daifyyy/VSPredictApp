"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { competitionGroupLabel, groupCompetitionFixtures, localDateKey } from "@/lib/competitionGrouping";
import { isPredictionPresetId, matchesPredictionPreset, PREDICTION_PRESETS, predictionPresetReason, type PredictionPresetId, type PredictionPresetSignals } from "@/lib/predictionPresets";
import { CompetitionDayTabs } from "./CompetitionDayTabs";
import { FixtureModelCard } from "./FixtureModelCard";
import { QuickMatchOverview } from "./QuickMatchOverview";
import { ProLock } from "./ProLock";
import { TeamLogo } from "./TeamLogo";
import type { SessionUser } from "./sessionUser";

interface Offer extends PredictionPresetSignals {
  fixtureId: number; kickoff: string; leagueId: number; leagueName: string;
  competitionGroup: "EUROPE" | "CLUB" | "NATIONAL"; competitionOrder: number;
  home: { id: number; name: string; logoUrl: string };
  away: { id: number; name: string; logoUrl: string };
  lowConfidence: boolean; hasOdds: boolean; largestDifference: number | null;
}
type Scope = "all" | Offer["competitionGroup"];

export function PredictionOffers({ user, marketView }: { user: SessionUser | null; marketView: boolean }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [odds, setOdds] = useState<"all" | "with" | "without">("all");
  const [league, setLeague] = useState("all");
  const [direction, setDirection] = useState<"all" | "positive" | "negative">("all");
  const [preset, setPreset] = useState<PredictionPresetId>("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeDate, setActiveDate] = useState("");
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null);
  const [expandedLeagues, setExpandedLeagues] = useState<Set<number>>(new Set());

  useEffect(() => {
    let active = true;
    fetch("/api/picks/offers").then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!active) return;
        if (body.locked) setLocked(true); else if (!response.ok) setError(true); else setOffers(body.offers ?? []);
      }).catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const baseFiltered = useMemo(() => (offers ?? [])
    .filter((offer) => scope === "all" || offer.competitionGroup === scope)
    .filter((offer) => odds === "all" || (odds === "with") === offer.hasOdds)
    .filter((offer) => league === "all" || offer.leagueId === Number(league))
    .filter((offer) => !marketView || direction === "all" || offer.largestDifference != null && (direction === "positive" ? offer.largestDifference >= 0 : offer.largestDifference < 0)),
  [offers, scope, odds, league, direction, marketView]);
  const presetCounts = useMemo(() => Object.fromEntries(PREDICTION_PRESETS.map((item) => [item.id, baseFiltered.filter((offer) => matchesPredictionPreset(offer, item.id)).length])), [baseFiltered]);
  const filtered = useMemo(() => baseFiltered.filter((offer) => matchesPredictionPreset(offer, preset)), [baseFiltered, preset]);
  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const offer of filtered) counts.set(localDateKey(offer.kickoff), (counts.get(localDateKey(offer.kickoff)) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
  }, [filtered]);

  useEffect(() => {
    if (!days.length) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("date");
    const requestedPreset = params.get("preset");
    const today = localDateKey(new Date());
    const fallback = days.find((day) => day.date >= today)?.date ?? days[days.length - 1].date;
    const date = requested && days.some((day) => day.date === requested) ? requested : fallback;
    const fixture = Number(params.get("fixture"));
    const leagueId = Number(params.get("league"));
    queueMicrotask(() => {
      setActiveDate((current) => current && days.some((day) => day.date === current) ? current : date);
      if (isPredictionPresetId(requestedPreset)) setPreset(requestedPreset);
      if (fixture > 0) setExpandedFixture(fixture);
      if (leagueId > 0) setExpandedLeagues(new Set([leagueId]));
    });
  }, [days]);

  const visible = useMemo(() => filtered.filter((offer) => localDateKey(offer.kickoff) === activeDate), [filtered, activeDate]);
  const sections = useMemo(() => {
    const source = preset === "all" ? visible : filtered;
    const byDate = new Map<string, Offer[]>();
    for (const offer of source) {
      const date = localDateKey(offer.kickoff);
      byDate.set(date, [...(byDate.get(date) ?? []), offer]);
    }
    return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
      date,
      groups: groupCompetitionFixtures(rows.map((offer) => ({ ...offer, leagueLogoUrl: `https://media.api-sports.io/football/leagues/${offer.leagueId}.png` }))),
    }));
  }, [filtered, preset, visible]);
  const leagues = useMemo(() => [...new Map((offers ?? []).map((offer) => [offer.leagueId, offer.leagueName])).entries()].sort((a, b) =>
    (offers?.find((offer) => offer.leagueId === a[0])?.competitionOrder ?? 999) - (offers?.find((offer) => offer.leagueId === b[0])?.competitionOrder ?? 999)), [offers]);

  const writeUrl = (changes: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };
  const selectDate = (date: string) => { setActiveDate(date); setExpandedFixture(null); writeUrl({ date, fixture: null }); };
  const selectPreset = (value: PredictionPresetId) => { setPreset(value); setExpandedFixture(null); writeUrl({ preset: value === "all" ? null : value, fixture: null }); };
  const reset = () => { setPreset("all"); setScope("all"); setLeague("all"); setOdds("all"); setDirection("all"); setExpandedFixture(null); writeUrl({ preset: null, league: null, fixture: null, date: null }); };
  const advancedCount = Number(scope !== "all") + Number(league !== "all") + Number(odds !== "all") + Number(marketView && direction !== "all");
  const toggleLeague = (id: number) => setExpandedLeagues((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id);
    writeUrl({ league: next.has(id) ? String(id) : null }); return next;
  });

  if (locked) {
    const fallbackDate = typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("date") ?? localDateKey(new Date());
    return <div className="mt-4 space-y-4">
      <QuickMatchOverview date={fallbackDate || null} user={user} />
      <ProLock user={user} />
    </div>;
  }
  if (error) return <p className="mt-4 rounded-xl border border-border p-5 text-muted">Nabídku se nepodařilo načíst.</p>;
  if (!offers) return <div className="mt-4 h-32 animate-pulse rounded-xl bg-border/60" />;

  return <section className="mt-4">
    <div className="mb-2 flex items-end justify-between gap-3">
      <div><p className="page-kicker">Co hledám</p><h2 className="mt-1 text-base font-bold text-foreground">Rychlé modelové výběry</h2></div>
      {preset !== "all" && <button type="button" onClick={() => selectPreset("all")} className="ui-chip min-h-10 px-3 text-xs">Zrušit výběr</button>}
    </div>
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Rychlé modelové filtry">
      {PREDICTION_PRESETS.map((item) => <button key={item.id} type="button" aria-pressed={preset === item.id} onClick={() => selectPreset(item.id)} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold transition ${preset === item.id ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-muted hover:bg-accent/15 hover:text-foreground"}`}>{item.label}<span className="ml-1 opacity-70">{presetCounts[item.id] ?? 0}</span></button>)}
    </div>
    <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-strong [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-foreground">Další filtry</span>
        <span className="text-xs text-muted">Soutěž, liga a dostupnost trhu</span>
        {advancedCount > 0 && <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-bold text-accent-ink">Aktivní {advancedCount}</span>}
        <span className="ml-auto text-muted" aria-hidden>{advancedOpen ? "▲" : "▼"}</span>
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-border p-2">
        <Select label="Soutěže" value={scope} onChange={(value) => setScope(value as Scope)} options={[["all", "Vše"], ["CLUB", "Ligy"], ["EUROPE", "Evropa"], ["NATIONAL", "Reprezentace"]]} />
        <Select label="Liga" value={league} onChange={setLeague} options={[["all", "Všechny"], ...leagues.map(([id, name]) => [String(id), name])]} />
        <Select label="Kurzy" value={odds} onChange={(value) => setOdds(value as typeof odds)} options={[["all", "Vše"], ["with", "S trhem"], ["without", "Bez trhu"]]} />
        {marketView && <Select label="Rozdíl" value={direction} onChange={(value) => setDirection(value as typeof direction)} options={[["all", "Oba směry"], ["positive", "Model výše"], ["negative", "Trh výše"]]} />}
        {(advancedCount > 0 || preset !== "all") && <button type="button" onClick={reset} className="ui-chip min-h-11 px-3 text-xs">Resetovat vše</button>}
      </div>
    </details>
    <div className="mt-3 flex items-center justify-between gap-3">
      <div><p className="page-kicker">Kdy a kde</p><p className="mt-1 text-xs text-muted">Stejné pořadí dnů a soutěží jako v Programu.</p></div>
      <span className="shrink-0 text-xs text-muted">{preset === "all" ? visible.length : filtered.length} zápasů</span>
    </div>
    {preset === "all" && <CompetitionDayTabs days={days} activeDate={activeDate} onSelect={selectDate} />}
    {preset === "all" && <QuickMatchOverview date={activeDate || null} user={user} />}
    {preset !== "all" && <p className="mt-3 text-xs text-muted">Výběr pro celý dostupný horizont · modelový filtr, nikoli publikovaný tip.</p>}
    {marketView && <p className="mt-3 text-xs text-muted">Pořadí odpovídá Programu. Rozdíl model–trh není automaticky potvrzená value sázka.</p>}
    <div className="mt-3 space-y-3">
      {sections.map((section) => <div key={section.date}>
        {preset !== "all" && <h3 className="mb-2 mt-5 text-sm font-extrabold text-foreground">{new Date(`${section.date}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}</h3>}
        {section.groups.map((group, index) => {
          const open = preset !== "all" || expandedLeagues.has(group.leagueId);
          const showKind = group.kind !== section.groups[index - 1]?.kind;
          return <div key={group.leagueId}>
            {showKind && <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{competitionGroupLabel(group.kind)}</p>}
            <section className="ui-panel overflow-hidden">
              <div className="flex min-h-14 items-center gap-2 px-3.5 py-2.5">
                <button type="button" aria-expanded={open} onClick={() => toggleLeague(group.leagueId)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"><TeamLogo src={group.logoUrl} alt={group.name} size={20} /><strong className="truncate text-sm">{group.name}</strong><span className="text-xs text-muted">{group.fixtures.length}</span><span className="ml-auto text-muted" aria-hidden>{open ? "▲" : "▼"}</span></button>
                <Link href={`/?date=${section.date}&league=${group.leagueId}`} className="ui-chip min-h-11 px-3 text-xs">Program</Link>
                {group.kind === "CLUB" && <Link href={`/tabulky?league=${group.leagueId}`} className="ui-chip hidden min-h-11 px-3 text-xs sm:inline-flex">Tabulka</Link>}
              </div>
              {open && <div className="divide-y divide-border border-t border-border">{group.fixtures.map((offer) => {
                const detailOpen = expandedFixture === offer.fixtureId;
                return <article key={offer.fixtureId}>
                  <button type="button" aria-expanded={detailOpen} onClick={() => { setExpandedFixture(detailOpen ? null : offer.fixtureId); writeUrl({ fixture: detailOpen ? null : String(offer.fixtureId) }); }} className="grid min-h-16 w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-surface">
                    <time className="text-xs tabular-nums text-muted">{new Date(offer.kickoff).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</time>
                    <span className="flex min-w-0 items-center gap-2 font-semibold"><TeamLogo src={offer.home.logoUrl} alt={offer.home.name} size={22} /><span className="truncate">{offer.home.name}</span><span className="text-muted">–</span><TeamLogo src={offer.away.logoUrl} alt={offer.away.name} size={22} /><span className="truncate">{offer.away.name}</span></span>
                    <span className="flex items-center gap-2 text-xs tabular-nums text-muted">{preset !== "all" && <strong className="text-accent-strong">{predictionPresetReason(offer, preset)}</strong>}{offer.lowConfidence && <span className="rounded-full bg-warning/15 px-2 py-1 text-[10px] text-warning">Omezený vzorek</span>}{marketView && offer.largestDifference != null && <strong className={offer.largestDifference >= 0 ? "text-positive" : "text-warning"}>{offer.largestDifference >= 0 ? "+" : ""}{Math.round(offer.largestDifference * 100)} p. b.</strong>}{marketView && !offer.hasOdds && <span className="rounded-full bg-surface px-2 py-1 text-[10px]">Bez trhu</span>}<span aria-hidden>{detailOpen ? "▲" : "▼"}</span></span>
                  </button>
                  {detailOpen && <div className="border-t border-border p-3"><FixtureModelCard fixtureId={offer.fixtureId} /></div>}
                </article>;
              })}</div>}
            </section>
          </div>;
        })}
      </div>)}
      {!sections.length && <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">Pro zvolenou předvolbu a filtry nemáme uloženou predikci.</p>}
    </div>
  </section>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold"><span className="text-muted">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-foreground outline-none">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
