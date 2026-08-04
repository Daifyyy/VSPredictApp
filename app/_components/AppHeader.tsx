"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AccountMenu } from "./AccountMenu";
import { DesktopSidebar, MobileBottomNav, SectionNav } from "./nav";
import type { SessionUser } from "./sessionUser";
import { shareOrCopy } from "./share";
import { TeamSearch } from "./TeamSearch";

/**
 * Sdílená hlavička všech stránek: řádek s logem a účtem, pod ním pásek sekcí.
 *
 * **Seznam sekcí si hlídá `nav.tsx`, ne volající.** Dokud si ho každá stránka předávala
 * propem, lišil se obsahem i pořadím a dvě sekce byly prakticky neobjevitelné. Hlavička
 * proto žádný `nav` prop nemá – stačí ji vykreslit.
 */
export function AppHeader({
  user,
  share = false,
}: {
  user: SessionUser | null;
  share?: boolean;
}) {
  return (
    <>
      <DesktopSidebar />
      <header className="relative z-30">
        <div className="app-topbar">
          <Link
            href="/"
            aria-label="Football Insight – domů"
            className="flex shrink-0 items-center gap-2.5 lg:hidden"
          >
            <Image
              src="/brand-mark.svg"
              alt="Football Insight"
              width={40}
              height={40}
              priority
              className="rounded-xl shadow-sm"
            />
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-bold tracking-tight text-foreground">Football Insight</span>
              <span className="block text-[11px] text-muted">Fotbal v souvislostech</span>
            </span>
          </Link>
          <TeamSearch />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {share && <ShareButton />}
            <AccountMenu user={user} />
          </div>
        </div>
        <SectionNav />
      </header>
      <MobileBottomNav />
    </>
  );
}

function ShareButton() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function share() {
    const outcome = await shareOrCopy(window.location.href, "Football Insight — porovnání týmů");
    if (outcome === "copied") {
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } else if (outcome === "error") {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }
  // Emoji nese stav i na mobilu (kde je popisek skrytý).
  const emoji = state === "copied" ? "✓" : state === "error" ? "⚠" : "🔗";
  const label =
    state === "copied"
      ? "Zkopírováno"
      : state === "error"
        ? "Nešlo zkopírovat"
        : "Sdílet";
  return (
    <button
      type="button"
      onClick={share}
      title="Sdílet odkaz na toto porovnání"
      aria-label="Sdílet"
      className="min-h-11 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-bold text-muted transition hover:-translate-y-0.5 hover:border-foreground/30 hover:text-foreground"
    >
      <span aria-hidden>{emoji}</span>
      <span className="hidden sm:inline"> {label}</span>
    </button>
  );
}
