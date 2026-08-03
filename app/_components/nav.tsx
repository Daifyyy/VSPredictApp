"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = "matches" | "analysis" | "tips" | "game";

export interface NavItem {
  href: string;
  label: string;
  section: NavSection;
}

/** Veřejné URL zůstávají stabilní; seskupení mění jen informační architekturu. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Zápasy", section: "matches" },
  { href: "/porovnani", label: "Porovnání", section: "analysis" },
  { href: "/tabulky", label: "Tabulky", section: "analysis" },
  { href: "/predikce", label: "Predikce", section: "analysis" },
  { href: "/digest", label: "Model vs. trh", section: "analysis" },
  { href: "/transfers", label: "Přestupy", section: "analysis" },
  { href: "/tipovacka", label: "Moje tipy", section: "tips" },
  { href: "/hra", label: "Manažer", section: "game" },
];

const PRIMARY_ITEMS: Array<{
  href: string;
  label: string;
  shortLabel: string;
  section: NavSection;
  icon: IconName;
}> = [
  { href: "/", label: "Zápasy", shortLabel: "Zápasy", section: "matches", icon: "matches" },
  {
    href: "/porovnani",
    label: "Analýzy",
    shortLabel: "Analýzy",
    section: "analysis",
    icon: "analysis",
  },
  {
    href: "/tipovacka",
    label: "Moje tipy",
    shortLabel: "Tipy",
    section: "tips",
    icon: "tips",
  },
  { href: "/hra", label: "Manažer", shortLabel: "Manažer", section: "game", icon: "game" },
];

export function isActiveSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentSection(pathname: string): NavSection {
  return NAV_ITEMS.find((item) => isActiveSection(pathname, item.href))?.section ?? "matches";
}

/** Primární navigace na desktopu + kontextové podsekce Analýz. */
export function SectionNav() {
  const pathname = usePathname();
  const section = currentSection(pathname);

  return (
    <>
      <nav aria-label="Hlavní navigace" className="mt-3 hidden items-center gap-1 md:flex">
        {PRIMARY_ITEMS.map((item) => {
          const active = section === item.section;
          return (
            <Link
              key={item.section}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {section === "analysis" && (
        <nav
          aria-label="Sekce analýz"
          className="mt-3 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex gap-1.5 pb-1 md:border-t md:border-border md:pt-3">
            {NAV_ITEMS.filter((item) => item.section === "analysis").map((item) => {
              const active = isActiveSection(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}

/** Mobilní navigace drží čtyři hlavní úkoly vždy na dosah palce. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const section = currentSection(pathname);

  return (
    <nav
      aria-label="Hlavní mobilní navigace"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 px-1">
        {PRIMARY_ITEMS.map((item) => {
          const active = section === item.section;
          return (
            <Link
              key={item.section}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition ${
                active ? "text-foreground" : "text-muted"
              }`}
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full transition ${
                  active ? "bg-foreground text-background" : ""
                }`}
              >
                <NavIcon name={item.icon} />
              </span>
              {item.shortLabel}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconName = "matches" | "analysis" | "tips" | "game";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    matches: <path d="M7 2v3m10-3v3M3.5 9h17M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 9h2v2H8v-2Zm6 0h2v2h-2v-2Z" />,
    analysis: <path d="M4 19V9m5 10V5m5 14v-7m5 7V3M2 21h20" />,
    tips: <path d="m12 3 2.1 4.26 4.7.69-3.4 3.31.8 4.68L12 13.7l-4.2 2.24.8-4.68-3.4-3.31 4.7-.69L12 3Zm-7 16h14" />,
    game: <path d="M8.5 8h7a5.5 5.5 0 0 1 5.17 7.38l-.73 2a2.5 2.5 0 0 1-4.11.94L14.5 17h-5l-1.33 1.32a2.5 2.5 0 0 1-4.11-.94l-.73-2A5.5 5.5 0 0 1 8.5 8ZM8 11v4m-2-2h4m6-1h.01M18 14h.01" />,
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      {paths[name]}
    </svg>
  );
}
