"use client";

import { useEffect, useState } from "react";

type State = {
  configured: boolean;
  publicKey: string | null;
  subscribed: boolean;
  preference: {
    enabled: boolean;
    favoriteKickoff: boolean;
    kickoffMinutes: 30 | 60 | 120;
    publishedPrediction: boolean;
    marketMovement: boolean;
    movementThreshold: 3 | 5 | 8;
    smartFavoriteLeagues: boolean;
    halftimeAndFinal: boolean;
    checklistCandidate: boolean;
    directorImportant: boolean;
  };
};

const base64UrlToUint8Array = (value: string) => {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
};

export function PushSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    if (!open) return;
    void fetch("/api/push", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nastavení se nepodařilo načíst.");
        setState(await response.json() as State);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Nastavení se nepodařilo načíst."));
  }, [open]);

  if (!open) return null;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  async function enable() {
    if (!state?.publicKey || !supported) return;
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Upozornění nebyla v prohlížeči povolena.");
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      const subscription = current ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(state.publicKey),
      });
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), preference: state.preference }),
      });
      if (!response.ok) throw new Error("Zařízení se nepodařilo přihlásit k upozorněním.");
      setState({ ...state, subscribed: true, preference: { ...state.preference, enabled: true } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Zapnutí upozornění selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function savePreference() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("Zařízení už není přihlášené k upozorněním.");
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), preference: { ...state.preference, enabled: true } }),
      });
      if (!response.ok) throw new Error("Nastavení se nepodařilo uložit.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Uložení nastavení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Upozornění se nepodařilo vypnout.");
        await subscription.unsubscribe();
      }
      if (state) setState({ ...state, subscribed: false, preference: { ...state.preference, enabled: false } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vypnutí upozornění selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError("");
    setTestResult("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = await response.json().catch(() => null) as { error?: string; sent?: number } | null;
      if (!response.ok) throw new Error(data?.error ?? "Testovací upozornění selhalo.");
      setTestResult(`Odesláno na ${data?.sent ?? 1} zařízení.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Testovací upozornění selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[80] grid place-items-center bg-foreground/25 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="push-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="push-title" className="text-lg font-bold text-foreground">Upozornění na zápasy</h2><p className="mt-1 text-sm leading-5 text-muted">Předzápasové, modelové a výsledkové zprávy na jednom místě.</p></div>
        <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-xl text-muted hover:bg-background" aria-label="Zavřít">×</button>
      </div>
      {!supported ? <p className="mt-4 rounded-lg bg-warning/10 p-3 text-sm text-foreground">Tento prohlížeč Web Push nepodporuje. Na iPhonu nejdřív přidej aplikaci na plochu a otevři ji z její ikony.</p> : null}
      {state && !state.configured ? <p className="mt-4 rounded-lg bg-warning/10 p-3 text-sm text-foreground">Server ještě nemá nastavené VAPID klíče.</p> : null}
      {state ? <div className="mt-4 space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Před zápasem</p>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold text-foreground"><span>Připomenout oblíbený zápas</span><input type="checkbox" checked={state.preference.favoriteKickoff} onChange={(event) => setState({ ...state, preference: { ...state.preference, favoriteKickoff: event.target.checked } })} className="h-5 w-5 accent-positive" /></label>
        <label className="block text-sm font-semibold text-foreground">Čas připomínky
          <select value={state.preference.kickoffMinutes} onChange={(event) => setState({ ...state, preference: { ...state.preference, kickoffMinutes: Number(event.target.value) as 30 | 60 | 120 } })} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
            <option value={30}>30 minut předem</option><option value={60}>60 minut předem</option><option value={120}>2 hodiny předem</option>
          </select>
        </label>
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Průběh a výsledek</p>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground"><span><b>Poločas a konečný výsledek</b><small className="block text-muted">Jen konkrétní zápasy označené hvězdičkou</small></span><input type="checkbox" checked={state.preference.halftimeAndFinal} onChange={(event) => setState({ ...state, preference: { ...state.preference, halftimeAndFinal: event.target.checked } })} className="h-5 w-5 accent-positive" /></label>
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Model a trh</p>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground"><span><b>Zahrnout oblíbené ligy</b><small className="block text-muted">Jen chytré signály, ne každý výkop</small></span><input type="checkbox" checked={state.preference.smartFavoriteLeagues} onChange={(event) => setState({ ...state, preference: { ...state.preference, smartFavoriteLeagues: event.target.checked } })} className="h-5 w-5 accent-positive" /></label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground"><span><b>Nový publikovaný tip</b><small className="block text-muted">Pouze když projde pravidlem modelu</small></span><input type="checkbox" checked={state.preference.publishedPrediction} onChange={(event) => setState({ ...state, preference: { ...state.preference, publishedPrediction: event.target.checked } })} className="h-5 w-5 accent-positive" /></label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground"><span><b>Nový kandidát checklistu</b><small className="block text-muted">1X2 nebo góly, až po nejméně 3 kurzových vzorcích</small></span><input type="checkbox" checked={state.preference.checklistCandidate} onChange={(event) => setState({ ...state, preference: { ...state.preference, checklistCandidate: event.target.checked } })} className="h-5 w-5 accent-positive" /></label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground"><span><b>Důležité události kariéry</b><small className="block text-muted">Vzácné achievementy a kritické termíny klubového ředitele</small></span><input type="checkbox" checked={state.preference.directorImportant} onChange={(event) => setState({ ...state, preference: { ...state.preference, directorImportant: event.target.checked } })} className="h-5 w-5 accent-positive" /></label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-foreground"><span><b>Výrazný pohyb trhu</b><small className="block text-muted">Alespoň 3 použitelné vzorky, směrem k modelu</small></span><input type="checkbox" checked={state.preference.marketMovement} onChange={(event) => setState({ ...state, preference: { ...state.preference, marketMovement: event.target.checked } })} className="h-5 w-5 accent-positive" /></label>
          {state.preference.marketMovement && <label className="block text-xs font-semibold text-muted">Minimální posun
            <select value={state.preference.movementThreshold} onChange={(event) => setState({ ...state, preference: { ...state.preference, movementThreshold: Number(event.target.value) as 3 | 5 | 8 } })} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"><option value={3}>3 procentní body</option><option value={5}>5 procentních bodů</option><option value={8}>8 procentních bodů</option></select>
          </label>}
        </div>
        <p className="text-xs leading-5 text-muted">Oblíbené ligy rozšiřují pouze modelové signály. Poločas a výsledek chodí jen u konkrétního zápasu a každá událost nejvýše jednou.</p>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        {testResult && <p role="status" className="text-sm font-semibold text-positive">{testResult}</p>}
        {state.subscribed ? <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => void savePreference()} className="min-h-11 rounded-lg bg-positive px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Ukládám…" : "Uložit nastavení"}</button>
          <button type="button" disabled={busy} onClick={() => void sendTest()} className="min-h-11 rounded-lg border border-positive/30 bg-positive/10 px-4 text-sm font-bold text-positive disabled:opacity-50">Poslat test</button>
          <button type="button" disabled={busy} onClick={() => void disable()} className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-bold text-foreground disabled:opacity-50 sm:col-span-2">Vypnout na tomto zařízení</button>
        </div> : <button type="button" disabled={busy || !supported || !state.configured} onClick={() => void enable()} className="min-h-11 w-full rounded-lg bg-positive px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Ukládám…" : "Zapnout upozornění"}</button>}
      </div> : !error ? <p className="mt-4 text-sm text-muted">Načítám nastavení…</p> : null}
    </section>
  </div>;
}
