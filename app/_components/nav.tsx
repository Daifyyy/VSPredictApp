"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = "matches" | "analysis" | "tips" | "game";

export interface NavItem {
  href: string;
  label: string;
  section: NavSection;
  description?: string;
}

/** Veřejné URL zůstávají stabilní; seskupení mění jen informační architekturu. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Zápasy", section: "matches", description: "Program a výsledky" },
  { href: "/porovnani", label: "Porovnání", section: "analysis", description: "Tým proti týmu" },
  { href: "/tabulky", label: "Tabulky", section: "analysis", description: "Ligové pořadí" },
  { href: "/predikce", label: "Predikce", section: "analysis", description: "Co čeká model" },
  { href: "/transfers", label: "Přestupy", section: "analysis", description: "Pohyb v klubech" },
  { href: "/tipovacka", label: "Moje tipy", section: "tips", description: "Osobní deník" },
  { href: "/hra", label: "Manažer", section: "game", description: "Vlastní kariéra" },
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
      {section === "analysis" && (
        <nav
          aria-label="Sekce analýz"
          className="mt-3 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex gap-1.5 pb-1">
            {NAV_ITEMS.filter((item) => item.section === "analysis").map((item) => {
              const active = isActiveSection(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "border-accent-strong/30 bg-accent/25 text-foreground"
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

/** Pevná redakční navigace pro široký desktop. */
export function DesktopSidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[17rem] flex-col border-r border-border bg-sidebar p-5 text-foreground lg:flex">
      <Link href="/" className="flex items-center gap-3 border-b border-border pb-5" aria-label="Football Insight – domů">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-sm font-black text-accent-ink">FI</span>
        <span>
          <span className="block font-display text-xl font-bold tracking-tight">Football Insight</span>
          <span className="block text-[10px] font-bold uppercase tracking-[.14em] text-muted">Fotbal v souvislostech</span>
        </span>
      </Link>

      <nav aria-label="Hlavní navigace" className="mt-6 flex flex-1 flex-col gap-2">
        {NAV_ITEMS.map((item, index) => {
          const active = isActiveSection(pathname, item.href);
          const showDivider = index === 1 || index === 6 || index === 7;
          return (
            <div key={item.href} className={showDivider ? "mt-3 border-t border-border pt-4" : ""}>
              {showDivider && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted">
                  {item.section === "analysis" ? "Analýzy" : item.section === "tips" ? "Osobní" : "Hra"}
                </p>
              )}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 transition ${
                  active ? "bg-accent/25 text-foreground ring-1 ring-accent-strong/20" : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-accent/60" : "bg-background"}`}>
                  <NavIcon name={item.section === "matches" ? "matches" : item.section === "tips" ? "tips" : item.section === "game" ? "game" : "analysis"} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold leading-tight">{item.label}</span>
                  <span className="block truncate text-[10px] text-muted">{item.description}</span>
                </span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="rounded-xl border border-border bg-background p-4">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-accent-strong">Datově poctivé</p>
        <p className="mt-1 text-xs leading-5 text-muted">Predikce oddělujeme od ověřené výhody nad trhem.</p>
      </div>
    </aside>
  );
}

/** Mobilní navigace drží čtyři hlavní úkoly vždy na dosah palce. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const section = currentSection(pathname);

  return (
    <nav
      aria-label="Hlavní mobilní navigace"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/96 pb-[env(safe-area-inset-bottom)] text-foreground shadow-[0_-6px_20px_rgb(30_45_34/.08)] backdrop-blur lg:hidden"
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
                  active ? "bg-accent/55 text-accent-ink" : ""
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
