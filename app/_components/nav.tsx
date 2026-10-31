"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = "matches" | "results" | "performance";
export interface NavItem { href: string; label: string; section: NavSection; description?: string; icon: IconName }
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Program", section: "matches", description: "Nadcházející zápasy a predikce", icon: "matches" },
  { href: "/vysledky", label: "Výsledky", section: "results", description: "Konečné výsledky a audit", icon: "tips" },
  { href: "/vykonnost", label: "Výkonnost", section: "performance", description: "Modely, strategie a historie", icon: "strategy" },
];
export function isActiveSection(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/zapas/") || pathname === "/denni-vyber";
  return pathname === href || pathname.startsWith(href + "/");
}
export function SectionNav() { return null; }

export function DesktopSidebar() {
  const pathname = usePathname();
  return <aside className="fixed inset-y-0 left-0 z-50 hidden w-[17rem] flex-col border-r border-border bg-sidebar p-5 text-foreground lg:flex">
    <Link href="/" className="border-b border-border pb-5 text-xl font-bold">Football Insight</Link>
    <nav aria-label="Hlavní navigace" className="mt-6 flex flex-1 flex-col gap-3">
      {NAV_ITEMS.map(item => <Link key={item.href} href={item.href} prefetch={false} aria-current={isActiveSection(pathname,item.href) ? "page" : undefined}
        className={`flex min-h-14 items-center gap-3 rounded-xl p-3 ${isActiveSection(pathname,item.href) ? "bg-accent/25" : "hover:bg-background"}`}>
        <NavIcon name={item.icon}/><span><strong className="block">{item.label}</strong><span className="text-xs text-muted">{item.description}</span></span>
      </Link>)}
    </nav>
    <Link href="/tipovacka" prefetch={false} className="text-xs text-muted underline">Osobní deník tipů</Link>
    <p className="mt-4 text-xs text-muted">Predikce není záruka výhry. Výzkumné strategie vedeme odděleně.</p>
  </aside>;
}
export function MobileBottomNav() {
  const pathname = usePathname();
  return <nav aria-label="Hlavní mobilní navigace" className="mobile-bottom-nav border-t border-border bg-surface lg:hidden">
    <div className="mx-auto grid max-w-lg grid-cols-3">
      {NAV_ITEMS.map(item => <Link key={item.href} href={item.href} prefetch={false}
        aria-current={isActiveSection(pathname,item.href) ? "page" : undefined}
        className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-bold ${isActiveSection(pathname,item.href) ? "bg-accent/25" : "text-muted"}`}>
        <NavIcon name={item.icon}/>{item.label}
      </Link>)}
    </div>
  </nav>;
}
type IconName = "matches" | "analysis" | "compare" | "table" | "prediction" | "strategy" | "transfer" | "tips" | "game";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    matches: <path d="M7 2v3m10-3v3M3.5 9h17M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 9h2v2H8v-2Zm6 0h2v2h-2v-2Z" />,
    analysis: <path d="M4 19V9m5 10V5m5 14v-7m5 7V3M2 21h20" />,
    compare: <path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3 3m-3-3 3-3" />,
    table: <path d="M4 5h16v14H4V5Zm0 5h16M9 5v14m5-14v14" />,
    prediction: <path d="M4 19V9m5 10V5m5 14v-7m5 7V3M2 21h20" />,
    strategy: <path d="M5 20V10m7 10V4m7 16v-7M3 20h18M4 7l6-3 5 4 5-5" />,
    transfer: <path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3 3m-3-3 3-3" />,
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
