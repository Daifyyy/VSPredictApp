export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-5" aria-label="Načítání obsahu" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-border/70 motion-reduce:animate-none" />
      <div className="mt-5 grid gap-3">
        <div className="h-28 animate-pulse rounded-2xl bg-border/50 motion-reduce:animate-none" />
        <div className="h-44 animate-pulse rounded-2xl bg-border/50 motion-reduce:animate-none" />
      </div>
    </main>
  );
}
