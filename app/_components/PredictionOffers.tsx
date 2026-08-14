"use client";

import { useEffect, useMemo, useState } from "react";
import { FixtureModelCard } from "./FixtureModelCard";
import { ProLock } from "./ProLock";
import { TeamLogo } from "./TeamLogo";
import type { SessionUser } from "./sessionUser";

interface Offer {
  fixtureId: number;
  kickoff: string;
  leagueId: number;
  leagueName: string;
  home: { id: number; name: string; logoUrl: string };
  away: { id: number; name: string; logoUrl: string };
  europeanCup: boolean;
  lowConfidence: boolean;
  hasOdds: boolean;
  largestDifference: number | null;
}

export function PredictionOffers({ user, marketView }: { user: SessionUser | null; marketView: boolean }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(false);
  const [competition, setCompetition] = useState<"all" | "league" | "europe">("all");
  const [odds, setOdds] = useState<"all" | "with" | "without">("all");
  const [league, setLeague] = useState("all");
  const [window, setWindow] = useState<"all" | "today" | "week">("all");
  const [direction, setDirection] = useState<"all" | "positive" | "negative">("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/picks/offers")
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!active) return;
        if (body.locked) setLocked(true);
        else if (!response.ok) setError(true);
        else setOffers(body.offers ?? []);
      })
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const leagues = useMemo(() => [...new Map((offers ?? []).map((offer) => [offer.leagueId, offer.leagueName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "cs-CZ")), [offers]);
  const visible = useMemo(() => (offers ?? [])
    .filter((offer) => competition === "all" || (competition === "europe") === offer.europeanCup)
    .filter((offer) => odds === "all" || (odds === "with") === offer.hasOdds)
    .filter((offer) => league === "all" || offer.leagueId === Number(league))
    .filter((offer) => {
      if (window === "all") return true;
      const now = new Date();
      const kickoff = new Date(offer.kickoff);
      if (window === "week") return kickoff.getTime() <= now.getTime() + 7 * 86_400_000;
      return kickoff.toLocaleDateString("cs-CZ") === now.toLocaleDateString("cs-CZ");
    })
    .filter((offer) => !marketView || direction === "all" || offer.largestDifference != null && (direction === "positive" ? offer.largestDifference >= 0 : offer.largestDifference < 0))
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
      || Number(b.hasOdds) - Number(a.hasOdds)), [offers, competition, odds, league, window, direction, marketView]);

  if (locked) return <div className="mt-4"><ProLock user={user} /></div>;
  if (error) return <p className="mt-4 rounded-xl border border-border p-5 text-muted">Nabídku se nepodařilo načíst.</p>;
  if (!offers) return <div className="mt-4 h-32 animate-pulse rounded-xl bg-border/60" />;
  return (
    <section className="mt-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-2">
        <Select label="Soutěže" value={competition} onChange={(value) => setCompetition(value as typeof competition)} options={[["all", "Vše"], ["league", "Ligy"], ["europe", "Evropské poháry"]]} />
        <Select label="Liga" value={league} onChange={setLeague} options={[["all", "Všechny ligy"], ...leagues.map(([id, name]) => [String(id), name])]} />
        <Select label="Období" value={window} onChange={(value) => setWindow(value as typeof window)} options={[["all", "Všechny uložené"], ["today", "Dnes"], ["week", "7 dní"]]} />
        <Select label="Kurzy" value={odds} onChange={(value) => setOdds(value as typeof odds)} options={[["all", "Vše"], ["with", "S trhem"], ["without", "Bez trhu"]]} />
        {marketView && <Select label="Rozdíl" value={direction} onChange={(value) => setDirection(value as typeof direction)} options={[["all", "Oba směry"], ["positive", "Model výše"], ["negative", "Trh výše"]]} />}
        <span className="ml-auto self-center px-2 text-xs text-muted">{visible.length} zápasů</span>
      </div>
      {marketView && <p className="mt-3 text-xs text-muted">Kompletní nabídka je seřazená podle nejbližšího výkopu. Odchylka je jen srovnání tehdejšího modelu s odmaržovaným trhem; po rozbalení uvidíš i dosavadní pohyb z pravidelných vzorků.</p>}
      <div className="mt-3 space-y-2">
        {visible.map((offer) => {
          const open = expanded === offer.fixtureId;
          return <article key={offer.fixtureId} className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
            <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : offer.fixtureId)} className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-surface">
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">{offer.leagueName} · {new Date(offer.kickoff).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="mt-1 flex min-w-0 items-center gap-2 font-bold text-foreground"><TeamLogo src={offer.home.logoUrl} alt={offer.home.name} size={22} /><span className="truncate">{offer.home.name}</span><span className="text-muted">–</span><TeamLogo src={offer.away.logoUrl} alt={offer.away.name} size={22} /><span className="truncate">{offer.away.name}</span></span>
              </span>
              <span className="flex items-center gap-2 text-xs tabular-nums text-muted">
                {marketView && offer.largestDifference != null && <strong className={offer.largestDifference >= 0 ? "text-positive" : "text-warning"}>{offer.largestDifference >= 0 ? "+" : ""}{Math.round(offer.largestDifference * 100)} p. b.</strong>}
                {marketView && !offer.hasOdds && <span className="rounded-full bg-surface px-2 py-1 text-[10px]">Kurzy zatím nejsou</span>}
                <span aria-hidden="true">{open ? "▲" : "▼"}</span>
              </span>
            </button>
            {open && <div className="border-t border-border p-3"><FixtureModelCard fixtureId={offer.fixtureId} /></div>}
          </article>;
        })}
      </div>
    </section>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold"><span className="text-muted">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-foreground outline-none">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
