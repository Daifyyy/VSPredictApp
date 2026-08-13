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
      <div className="grid grid-cols-2 gap-2 text-center tabular-nums">
        <CountMetric market="corners" value={f.corners} />
        <CountMetric market="cards" value={f.cards} />
      </div>
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
  return (
    <span className="rounded-lg bg-surface px-2 py-2 text-muted">
      <small className="block">{presentation.icon} {presentation.label}</small>
      <strong className="text-foreground">{value ? `${value.home.toFixed(1)} : ${value.away.toFixed(1)} · ${value.total.toFixed(1)} celkem` : "Model není dostupný"}</strong>
    </span>
  );
}
