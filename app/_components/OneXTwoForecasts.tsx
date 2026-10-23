"use client";

import { useState } from "react";

export type OneXTwoForecast = {
  fixtureId: number;
  homeName: string;
  awayName: string;
  kickoff: string;
  modelVersion: number;
  capturedAt: string;
  probabilities: [number, number, number];
  market: [number, number, number] | null;
  quality: string;
};

const PAGE_SIZE = 30;
const percent = (value: number) => `${(value * 100).toFixed(1)} %`;
const timestamp = (value: string) => new Date(value).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });

export function OneXTwoForecasts({ rows, truncated = false }: { rows?: OneXTwoForecast[]; truncated?: boolean }) {
  const [requestedPage, setPage] = useState(0);
  const count = rows?.length ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  return <section aria-labelledby="one-x-two-forecasts" className="mt-6">
    <h2 id="one-x-two-forecasts" className="text-xl font-bold">Zachycené předzápasové pravděpodobnosti · současný model</h2>
    <p className="mt-2 text-sm leading-6 text-muted">Neměnný úvodní záznam stávajícího hlavního modelu před zápasem, nikoli nově nasazený model. Trh slouží jen jako pravděpodobnostní srovnání. Nejde o sázkové tipy ani doporučení.</p>
    {truncated && <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">Přehled je zkrácený kvůli limitu načtených záznamů. Zobrazený počet ani stránkování nepokrývají celý den.</p>}
    {!count ? <p className="ui-panel mt-3 border-dashed p-7 text-center">Úplný předzápasový audit pro tento den zatím není zachycen</p> : <>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {rows!.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => <article key={row.fixtureId} className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-bold">{row.homeName} – {row.awayName}</h3>
          <p className="mt-1 text-xs text-muted">Výkop {timestamp(row.kickoff)}</p>
          <table className="mt-3 w-full table-fixed text-right text-xs tabular-nums">
            <caption className="sr-only">Pravděpodobnosti výsledku: {row.homeName} – {row.awayName}</caption>
            <thead><tr><th scope="col" className="py-2 text-left">Zdroj</th><th scope="col">1 · Domácí</th><th scope="col">X · Remíza</th><th scope="col">2 · Hosté</th></tr></thead>
            <tbody>
              <tr className="border-t border-border"><th scope="row" className="py-2 text-left">Model</th>{row.probabilities.map((value, index) => <td key={index}>{percent(value)}</td>)}</tr>
              <tr className="border-t border-border text-muted"><th scope="row" className="py-2 text-left">Trh</th>{[0, 1, 2].map(index => <td key={index}>{row.market ? percent(row.market[index]) : "—"}</td>)}</tr>
            </tbody>
          </table>
          {!row.market && <p className="mt-1 text-xs text-muted">Tržní srovnání není zachyceno.</p>}
          <p className="mt-3 text-xs leading-5 text-muted">Model v{row.modelVersion} · zachyceno {timestamp(row.capturedAt)}<br />Kvalita záznamu: {row.quality}</p>
        </article>)}
      </div>
      <nav aria-label="Stránkování pravděpodobností 1X2" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-40">Předchozí</button>
        <p role="status">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} z {count}{truncated ? " načtených záznamů" : ""} · strana {page + 1}/{pages}</p>
        <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-40">Další</button>
      </nav>
    </>}
  </section>;
}
