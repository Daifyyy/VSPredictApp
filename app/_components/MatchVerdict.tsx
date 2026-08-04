/** Výrazná jednovětná předpověď nad predikcí. */
export function MatchVerdict({ verdict }: { verdict: string }) {
  if (!verdict) return null;
  return (
    <div className="ui-panel border-l-4 border-l-accent-strong p-4 text-left">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Verdikt
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground sm:text-base">
        {verdict}
      </p>
    </div>
  );
}
