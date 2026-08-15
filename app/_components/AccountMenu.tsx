"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import type { SessionUser } from "./sessionUser";
import { requestInstall } from "./installBus";
import { PushSettings } from "./PushSettings";

/** Přihlášení (Google) / účet s tier odznakem, instalací a odhlášením. */
export function AccountMenu({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => void signIn("google")}
        className="ui-control px-3 text-sm font-semibold text-muted transition hover:border-accent-strong/40 hover:text-foreground"
      >
        Přihlásit
      </button>
    );
  }

  const initial = (user.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const isPro = user.tier === "PRO";

  return (
    <><div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="ui-control flex items-center gap-2 px-2 text-sm font-medium text-foreground transition hover:border-accent-strong/40"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs font-semibold">
          {initial}
        </span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            isPro ? "bg-positive/15 text-positive" : "bg-muted/15 text-muted"
          }`}
        >
          {isPro ? "PRO" : "FREE"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          <div className="truncate px-3 py-2 text-xs text-muted">
            {user.name ?? "Účet"}
          </div>
          <MenuItem
            onClick={() => {
              setOpen(false);
              requestInstall();
            }}
          >
            📲 Nainstalovat aplikaci
          </MenuItem>
          <MenuItem onClick={() => { setOpen(false); setPushOpen(true); }}>
            🔔 Upozornění na zápasy
          </MenuItem>
          {isPro && (
            <MenuItem
              onClick={() => {
                setOpen(false);
                void manageSubscription();
              }}
            >
              💳 Spravovat předplatné
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Odhlásit
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false);
              void deleteAccount();
            }}
          >
            <span className="text-warning">Smazat účet</span>
          </MenuItem>
        </div>
      )}
    </div><PushSettings open={pushOpen} onClose={() => setPushOpen(false)} /></>
  );
}

/** Otevře Stripe billing portal (správa/zrušení předplatného). */
async function manageSubscription() {
  const res = await fetch("/api/stripe/portal", { method: "POST" });
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (data?.url) {
    window.location.href = data.url;
  } else {
    window.alert("Správu předplatného se teď nepodařilo otevřít.");
  }
}

/** GDPR: po potvrzení smaže účet a odhlásí. */
async function deleteAccount() {
  if (
    !window.confirm(
      "Opravdu smazat účet? Smažou se i tvoje oblíbená porovnání. Tuto akci nelze vrátit."
    )
  )
    return;
  const res = await fetch("/api/account", { method: "DELETE" });
  if (res.ok) {
    await signOut();
  } else {
    window.alert("Smazání se nezdařilo. Zkus to prosím později.");
  }
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block min-h-11 w-full px-3 py-2 text-left text-sm text-foreground transition hover:bg-background"
    >
      {children}
    </button>
  );
}
