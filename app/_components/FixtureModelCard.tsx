"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FixtureModelForecast } from "@/lib/types";
import { COUNT_MARKET_PRESENTATION } from "@/lib/picks/countPresentation";
import { useCurrentUser } from "./useCurrentUser";

type State =
  | { state: "loading" }
  | { state: "locked" }
  | { state: "empty" }
  | { state: "error" }
  | { state: "ready"; forecast: FixtureModelForecast };

export function FixtureModelCard({
  fixtureId,
  countsOnly = false,
}: {
  fixtureId: number;
  countsOnly?: boolean;
}) {
  const [data, setData] = useState<State>({ state: "loading" });
  const [revision, setRevision] = useState(0);
  const user = useCurrentUser();
  useEffect(() => {
    let active = true;
    fetch(`/api/predictions/fixture?fixture=${fixtureId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{
          locked?: boolean;
          forecast?: FixtureModelForecast | null;
        }>;
      })
      .then((result) => {
        if (!active) return;
        setData(
          result.locked
            ? { state: "locked" }
            : result.forecast
              ? { state: "ready", forecast: result.forecast }
              : { state: "empty" }
        );
      })
      .catch(() => active && setData({ state: "error" }));
    return () => {
      active = false;
    };
  }, [fixtureId, revision]);

  if (data.state === "loading") return <Message text="Načítám model…" />;
  if (data.state === "locked") return <Message text="Kompletní model zápasu je součástí PRO." />;
  if (data.state === "empty") return <Message text="Pro tento zápas zatím není uložená predikce." />;
  if (data.state === "error") return <Message text="Model se teď nepodařilo načíst." />;

  const f = data.forecast;
  const pct = (value: number) => `${Math.round(value * 100)} %`;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/55 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-foreground">Model před zápasem</strong>
        <div className="flex gap-1.5">
          {f.experimental && <Badge>Experimentální · Evropa</Badge>}
          {f.lowConfidence && <Badge>Omezený vzorek</Badge>}
        </div>
      </div>
      {!countsOnly && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
            <Metric label="Domácí" value={pct(f.outcome.home)} />
            <Metric label="Remíza" value={pct(f.outcome.draw)} />
            <Metric label="Hosté" value={pct(f.outcome.away)} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
            <Metric label="Očekávané góly" value={`${f.goals.home.toFixed(1)} : ${f.goals.away.toFixed(1)}`} />
            <Metric label="Over 2.5" value={pct(f.goals.over25)} />
            <Metric label="Oba skórují" value={pct(f.goals.btts)} />
          </div>
        </>
      )}
      <div className="grid gap-2 tabular-nums lg:grid-cols-2">
        <CountMetric market="corners" value={f.corners} />
        <CountMetric market="cards" value={f.cards} />
      </div>
      <RefereeProfile profile={f.refereeProfile} expanded={countsOnly} fixtureId={fixtureId} canEdit={user?.isAdmin === true} onAssigned={() => setRevision((value) => value + 1)} />
      {(f.corners || f.cards) && (
        <p className="text-[10px] leading-relaxed text-muted">
          Jde o experimentální porovnání, nikoli publikovaný tip ani potvrzenou výhodu proti trhu.
        </p>
      )}
    </div>
  );
}

function RefereeProfile({
  profile,
  expanded,
  fixtureId,
  canEdit,
  onAssigned,
}: {
  profile: FixtureModelForecast["refereeProfile"];
  expanded: boolean;
  fixtureId: number;
  canEdit: boolean;
  onAssigned: () => void;
}) {
  if (!profile) {
    return (
      <div className="rounded-lg bg-surface px-3 py-3 text-muted">
        <div className="flex items-center justify-between gap-3">
          <div><strong className="text-foreground">Rozhodčí</strong><p className="mt-1">Rozhodčí zatím neurčen.</p></div>
          {canEdit && <RefereeEditor fixtureId={fixtureId} label="Doplnit" onAssigned={onAssigned} />}
        </div>
      </div>
    );
  }
  const number = (value: number | null, digits = 1) => value == null ? "—" : value.toFixed(digits);
  return (
    <section className="rounded-lg bg-surface px-3 py-3 text-muted" aria-label="Profil rozhodčího">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <small className="block uppercase tracking-wide">Rozhodčí</small>
          <strong className="text-foreground">{profile.name}</strong>
          {canEdit && <div className="mt-1"><RefereeEditor fixtureId={fixtureId} label="Změnit" onAssigned={onAssigned} /></div>}
        </div>
        <div className="flex flex-wrap gap-1">
          {profile.smallSample && <Badge>Málo dat · {profile.sample} zápasů</Badge>}
          {profile.labels.map((label) => <Badge key={label}>{label}</Badge>)}
        </div>
      </div>
      <dl className={`mt-2 grid gap-2 ${expanded ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <Metric label="Karty / zápas" value={number(profile.cardsPerMatch)} />
        <Metric label="Fauly / zápas" value={number(profile.foulsPerMatch)} />
        <Metric label="Červené / zápas" value={number(profile.redCardsPerMatch, 2)} />
        <Metric label="Upravený faktor" value={`${profile.factor.toFixed(2)}×`} />
        <Metric
          label="Vliv na očekávání"
          value={profile.lambdaBefore != null && profile.lambdaAfter != null
            ? `${profile.lambdaBefore.toFixed(1)} → ${profile.lambdaAfter.toFixed(1)}`
            : "—"}
        />
        {expanded && <Metric label="Karty na faul" value={number(profile.cardsPerFoul, 2)} />}
        {expanded && <Metric label="Percentil karet" value={profile.cardPercentile == null ? "—" : `${profile.cardPercentile}.`} />}
        {expanded && <Metric label="Percentil faulů" value={profile.foulPercentile == null ? "—" : `${profile.foulPercentile}.`} />}
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed">
        Faktor porovnává skutečné karty s tím, co čekal týmový model, a je smrštěný k průměru.
        Jde o jeden vstup prognózy, nikoli sázkový tip; průměr může ovlivnit i typ přidělovaných zápasů.
      </p>
    </section>
  );
}

interface RefereeSuggestion {
  key: string;
  name: string;
  sample: number;
  leagueIds: number[];
}

function RefereeEditor({ fixtureId, label, onAssigned }: { fixtureId: number; label: string; onAssigned: () => void }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RefereeSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      fetch(`/api/referees/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Vyhledávání selhalo.");
          return response.json() as Promise<{ results: RefereeSuggestion[] }>;
        })
        .then((data) => { setResults(data.results); setActive(data.results.length ? 0 : -1); setStatus("idle"); })
        .catch((reason: Error) => { if (reason.name !== "AbortError") { setError("Rozhodčí se nepodařilo vyhledat."); setStatus("error"); } });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query]);

  async function choose(item: RefereeSuggestion) {
    setStatus("saving"); setError("");
    const response = await fetch("/api/referees/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureId, refereeKey: item.key }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setError(body.error ?? "Rozhodčího se nepodařilo uložit."); setStatus("error"); return; }
    setOpen(false); setQuery(""); setResults([]); setStatus("idle"); onAssigned();
  }

  if (!open) return <button type="button" className="min-h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-accent/15" onClick={() => { setOpen(true); window.setTimeout(() => inputRef.current?.focus()); }}>{label}</button>;
  return (
    <div className="relative w-full max-w-xs text-left">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value); setError("");
            if (value.trim().length < 3) { setResults([]); setActive(-1); setStatus("idle"); }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setOpen(false); setQuery(""); }
            else if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(results.length - 1, value + 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
            else if (event.key === "Enter" && active >= 0) { event.preventDefault(); void choose(results[active]); }
          }}
          role="combobox"
          aria-label="Vyhledat rozhodčího"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Alespoň 3 znaky příjmení"
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-positive focus:ring-2 focus:ring-positive/20"
        />
        <button type="button" aria-label="Zavřít" className="min-h-10 min-w-10 rounded-lg border border-border" onClick={() => { setOpen(false); setQuery(""); }}>×</button>
      </div>
      {query.trim().length >= 3 && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+.35rem)] z-50 overflow-hidden rounded-xl border border-border bg-background p-1 shadow-xl">
          {status === "loading" && <p className="px-3 py-3 text-muted" role="status">Hledám…</p>}
          {status !== "loading" && !results.length && <p className="px-3 py-3 text-muted">Žádný známý rozhodčí.</p>}
          {results.map((item, index) => (
            <button key={item.key} id={`${listId}-${index}`} role="option" aria-selected={active === index} type="button" onMouseEnter={() => setActive(index)} onClick={() => void choose(item)} disabled={status === "saving"} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left ${active === index ? "bg-accent/20" : "hover:bg-surface"}`}>
              <strong className="text-foreground">{item.name}</strong>
              <span className="shrink-0 text-[10px] text-muted">{item.sample} zápasů · {item.leagueIds.length} soutěží</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-[10px] text-negative" role="alert">{error}</p>}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted">{text}</p>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">{children}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <span className="rounded-lg bg-surface px-2 py-2 text-muted"><small className="block">{label}</small><strong className="text-foreground">{value}</strong></span>;
}

function CountMetric({
  market,
  value,
}: {
  market: keyof typeof COUNT_MARKET_PRESENTATION;
  value: FixtureModelForecast["corners"];
}) {
  const presentation = COUNT_MARKET_PRESENTATION[market];
  if (!value) {
    return (
      <div className="rounded-lg bg-surface px-3 py-3 text-muted">
        <strong className="text-foreground">{presentation.icon} {presentation.label}</strong>
        <p className="mt-2">Model není dostupný.</p>
      </div>
    );
  }
  const pct = (probability: number) => `${Math.round(probability * 100)} %`;
  const pp = (difference: number) => `${difference >= 0 ? "+" : ""}${Math.round(difference * 100)} p. b.`;
  return (
    <div className="rounded-lg bg-surface px-3 py-3 text-left text-muted">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-foreground">{presentation.icon} {presentation.label}</strong>
        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
          Experimentální odhad · {value.evaluatedSample} vyhodnoceno
        </span>
      </div>
      <dl className="mt-2 space-y-1.5">
        <CountRow label="Očekávání" value={`${value.home.toFixed(1)} : ${value.away.toFixed(1)} · ${value.total.toFixed(1)} celkem`} />
        {value.line != null && value.overProbability != null && value.underProbability != null ? (
          <>
            <CountRow label={`Model · linie ${value.line.toLocaleString("cs-CZ")}`} value={`Over ${pct(value.overProbability)} · Under ${pct(value.underProbability)}`} />
            {value.marketOverProbability != null && value.marketUnderProbability != null && value.overDifference != null ? (
              <>
                <CountRow label="Odmaržovaný trh" value={`Over ${pct(value.marketOverProbability)} · Under ${pct(value.marketUnderProbability)}`} />
                <CountRow
                  label="Rozdíl model–trh"
                  value={`${value.overDifference >= 0 ? "Over" : "Under"} ${pp(Math.abs(value.overDifference))}`}
                />
              </>
            ) : <CountRow label="Porovnání s trhem" value="Chybí obě strany kurzu" />}
          </>
        ) : <CountRow label="Porovnání s trhem" value="Půlková linie není uložená" />}
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed">
        Verze {value.version} · disperze {value.varianceRatio.toFixed(1)}
        {value.nextReviewSample ? ` · další kontrola při ${value.nextReviewSample}` : " · připraveno k ručnímu posouzení"}.
        Rozdíl pouze ukazuje, kde se neověřený model liší od trhu.
      </p>
    </div>
  );
}

function CountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/60 pb-1 last:border-0">
      <dt>{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}
