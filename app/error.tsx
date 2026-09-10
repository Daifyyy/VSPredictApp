"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClass } from "./_components/ui/primitives";

/**
 * Kořenový error boundary (mimo /hra, které má vlastní). Bez něj dostane uživatel při
 * neošetřené výjimce v jakékoli server komponentě (/porovnani, /predikce, /tabulky,
 * /transfers, /tipovacka) holou default Next chybovou stránku bez cesty ven ani značky.
 * Kryje výpadky Neonu/API při SSR i chyby v klientských komponentách záložek.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 p-4">
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-[var(--shadow-panel)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-negative/10 text-xl text-negative" aria-hidden>!</span>
        <h1 className="mt-3 text-xl font-bold text-foreground">Něco se pokazilo</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Stránku se nepodařilo načíst. Zkus to znovu – pokud problém přetrvává, obnov
          stránku nebo se vrať na úvod.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={reset} variant="primary">
            Zkusit znovu
          </Button>
          <Link
            href="/"
            className={buttonClass("secondary")}
          >
            Na úvod
          </Link>
        </div>
      </div>
    </div>
  );
}
