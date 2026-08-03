// Sdílený skeleton pro route-level loading.tsx → okamžitá zpětná vazba po kliknutí
// na záložku (server stránky blokují render na getCurrentUser → DB). Čistě statické
// markup (žádný "use client"), aby šlo prefetchnout a zobrazit ihned.

export function AppSkeleton() {
  return (
    <div className="flex-1">
      <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:py-7">
        {/* hlavička (logo + akce) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-border/60" />
            <div className="hidden space-y-1 sm:block">
              <div className="h-4 w-20 animate-pulse rounded bg-border/60" />
              <div className="h-2.5 w-28 animate-pulse rounded bg-border/50" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-9 animate-pulse rounded-full bg-border/60" />
            <div className="h-8 w-9 animate-pulse rounded-full bg-border/60" />
          </div>
        </div>

        {/* pásek sekcí – musí sedět s `SectionNav`, jinak obsah po načtení poskočí */}
        <div className="mt-3 hidden gap-1.5 overflow-hidden border-b border-border pb-3 md:flex">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 shrink-0 animate-pulse rounded-xl bg-border/60"
              style={{ width: `${[104, 112, 108, 112][i]}px` }}
            />
          ))}
        </div>

        {/* úvodní panel + řádky obsahu */}
        <div className="mt-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="h-3 w-28 animate-pulse rounded bg-border/50" />
          <div className="mt-2 h-7 w-64 max-w-full animate-pulse rounded bg-border/60" />
          <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-border/50" />
          <div className="mt-2 h-4 w-3/4 max-w-md animate-pulse rounded bg-border/50" />
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-border/50" />
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-border/60" />
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-xl bg-border/60"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
