"use client";

import { useState } from "react";

type Job = "settle-results" | "snapshot-odds" | "audit-pipeline" | "refresh-strategy-metrics" | "refresh-pressure-performance" | "refresh-model-lab" | "refresh-legacy-stats" | "refresh-live-performance";

export function OperationsActions() {
  const [running, setRunning] = useState<Job | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function retry(job: Job) {
    setRunning(job);
    setMessage(null);
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, ...(job === "snapshot-odds" ? { limit: 12 } : {}) }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        processed?: number;
        remaining?: number;
        status?: string;
        limitedReason?: string;
      };
      if (!response.ok) throw new Error(data.error || "Opravný běh selhal");
      if (data.status === 'RESOURCE_LIMITED') { setMessage(`Úloha nebyla spuštěna: ${data.limitedReason ?? 'rozpočtové omezení'}.`); return; }
      if (data.status === 'DEFERRED') { setMessage(`Zpracováno ${data.processed ?? 0} změn v5. Původní bilance zůstává; pokračovat lze dalším během.`); return; }
      setMessage('Běh dokončen. Nový audit vytvoří pouze tlačítko Obnovit audit nebo auditní cron.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opravný běh selhal");
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="ui-panel mt-4 p-4">
      <h2 className="text-lg font-bold">Bezpečná oprava</h2>
      <p className="mt-1 text-sm text-muted">Použijte podle textu kritického incidentu. Operace jsou idempotentní a již hotovou práci neduplikují.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="ui-button ui-button-secondary" disabled={running != null} onClick={() => retry('refresh-legacy-stats')}>Připravit historické statistiky</button>
        <button className="ui-button ui-button-secondary" disabled={running != null} onClick={() => retry('refresh-live-performance')}>Připravit souhrn live modelů</button>
        <button className="ui-button ui-button-secondary" disabled={running != null} onClick={() => retry('refresh-model-lab')}>Připravit detaily Model Labu</button>
        <button className="ui-button ui-button-secondary" disabled={running != null} onClick={() => retry('audit-pipeline')}>Obnovit audit</button>
        <button className="ui-button ui-button-secondary" disabled={running != null} onClick={() => retry('refresh-strategy-metrics')}>Připravit souhrny strategií</button>
        <button className="ui-button ui-button-secondary" disabled={running != null} onClick={() => retry('refresh-pressure-performance')}>Vyhodnotit změny v5</button>
        <button className="ui-button ui-button-primary" disabled={running != null} onClick={() => retry("settle-results")}>
          {running === "settle-results" ? "Opravuji…" : "Opravit výsledky a statistiky"}
        </button>
        <button className="ui-button ui-button-secondary" disabled={running != null} onClick={() => retry("snapshot-odds")}>
          {running === "snapshot-odds" ? "Doplňuji…" : "Doplnit kurzové vzorky"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    </section>
  );
}
