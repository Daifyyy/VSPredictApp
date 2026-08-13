"use client";

import { useEffect, useState } from "react";
import type { FixtureModelForecast } from "@/lib/types";
import { COUNT_MARKET_PRESENTATION } from "@/lib/picks/countPresentation";

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
  }, [fixtureId]);

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
      {(f.corners || f.cards) && (
        <p className="text-[10px] leading-relaxed text-muted">
          Jde o experimentální porovnání, nikoli publikovaný tip ani potvrzenou výhodu proti trhu.
        </p>
      )}
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
