"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationFeedback() {
  const pathname = usePathname(); const search = useSearchParams();
  const [pending, setPending] = useState(false); const [recovery, setRecovery] = useState(false);
  useEffect(() => { queueMicrotask(() => setPending(false)); }, [pathname, search]);
  useEffect(() => {
    const click = (event: MouseEvent) => { const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null; if (!anchor || event.defaultPrevented || anchor.target || event.metaKey || event.ctrlKey || event.shiftKey || anchor.origin !== location.origin) return; if (`${anchor.pathname}${anchor.search}` !== `${location.pathname}${location.search}`) setPending(true); };
    const failed = (event: ErrorEvent | PromiseRejectionEvent) => { const message = "message" in event ? event.message : String(event.reason ?? ""); if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(message)) { setRecovery(true); void report("CHUNK_LOAD_ERROR"); } };
    const visible = () => { if (document.visibilityState !== "visible") return; const started = performance.now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000); fetch("/manifest.webmanifest", { cache: "no-store", signal: controller.signal }).then((response) => { if (!response.ok) throw new Error("health"); }).catch(() => setRecovery(true)).finally(() => { clearTimeout(timeout); const duration = Math.round(performance.now() - started); if (duration > 3000) void report("SLOW_RESUME", duration); }); };
    document.addEventListener("click", click, true); window.addEventListener("error", failed); window.addEventListener("unhandledrejection", failed); document.addEventListener("visibilitychange", visible);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("error", failed); window.removeEventListener("unhandledrejection", failed); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return <>{pending && <div role="progressbar" aria-label="Načítání stránky" className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-accent/25"><span className="block h-full w-1/2 animate-[nav-progress_1s_ease-in-out_infinite] bg-accent-strong motion-reduce:animate-none" /></div>}{recovery && <div role="alert" className="fixed inset-x-3 bottom-24 z-[100] mx-auto max-w-md rounded-xl border border-negative/30 bg-surface p-4 shadow-xl"><strong className="text-sm text-foreground">Aplikaci se nepodařilo obnovit</strong><p className="mt-1 text-xs text-muted">Připojení nebo uložená verze aplikace už není platná.</p><button type="button" onClick={() => window.location.reload()} className="ui-button-primary mt-3 min-h-10 px-4 text-sm">Načíst znovu</button></div>}</>;
}
function report(kind: string, durationMs?: number) { return fetch("/api/client-diagnostics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, durationMs, swState: navigator.serviceWorker?.controller ? "controlled" : "uncontrolled" }), keepalive: true }).catch(() => undefined); }
