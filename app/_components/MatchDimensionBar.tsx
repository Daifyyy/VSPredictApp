import type { MatchDimension } from "@/lib/stats/matchReport";

/**
 * Vizuální primitivy sdílené přehledem **dohraného** (`MatchReportPanel`) a
 * **probíhajícího** (`LiveReportPanel`) zápasu.
 *
 * Sdílí se jen kreslení, ne interpretace – přesně stejná dělící čára jako v `lib/stats`,
 * kde oba reporty berou rozměry z jedné funkce (`buildMatchDimensions`), ale prahy a věty
 * mají vlastní. Dvě kopie tohohle pruhu by se rozešly při první úpravě odsazení.
 */

/** Jeden rozměr jako protilehlé pruhy – vizuálně shodné s Kategoriemi v Porovnání. */
export function DimensionBar({ dim }: { dim: MatchDimension }) {
  if (!dim.available) return null;
  // Hostující strana se dopočítává z už zaokrouhlené domácí (viz `pairOf`), takže
  // `100 - homeShare` vždy sedí na čísla nad pruhem. Nezávislé zaokrouhlení by dalo 10.1.
  const homeShare = dim.home * 10;
  return (
    <div className="rounded-lg border border-border bg-background/55 p-3">
      <div className="grid grid-cols-[3rem_1fr_3rem] items-baseline gap-2 text-xs">
        <span className="font-bold tabular-nums text-home">{dim.home.toFixed(1)}</span>
        <span className="min-w-0 truncate text-center font-semibold text-foreground">
          {dim.label}
        </span>
        <span className="text-right font-bold tabular-nums text-away">{dim.away.toFixed(1)}</span>
      </div>
      <div className="relative mt-2 flex h-2.5 overflow-hidden rounded-full bg-border/60">
        <div className="bar-fill bg-home/80" style={{ width: `${homeShare}%` }} />
        <div className="bar-fill bg-away/80" style={{ width: `${100 - homeShare}%` }} />
      </div>
      {dim.detail && (
        <p className="mt-1.5 text-center text-[11px] text-muted">{dim.detail}</p>
      )}
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}
