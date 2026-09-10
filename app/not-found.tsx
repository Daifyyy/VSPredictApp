import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass } from "./_components/ui/primitives";

export const metadata: Metadata = {
  title: "Stránka nenalezena — Football Insight",
  // Neindexovat 404 – ať se prázdné cesty nedostanou do vyhledávače.
  robots: { index: false, follow: false },
};

/**
 * Globální 404. Dřív aplikace neměla žádnou vlastní not-found stránku → neexistující
 * cesta vracela holý Next default bez navigace zpět do appky.
 */
export default function NotFound() {
  return (
    <div className="flex-1 p-4">
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-[var(--shadow-panel)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-background text-xl" aria-hidden>?</span>
        <h1 className="mt-3 text-xl font-bold text-foreground">Stránka nenalezena</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Tahle adresa neexistuje nebo už není dostupná.
        </p>
        <Link
          href="/"
          className={buttonClass("primary", "md", "mt-5")}
        >
          Zpět na úvod
        </Link>
      </div>
    </div>
  );
}
