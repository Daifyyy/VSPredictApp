"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "./sessionUser";

let cachedUser: SessionUser | null | undefined;
let pendingUser: Promise<SessionUser | null> | null = null;

function loadCurrentUser(): Promise<SessionUser | null> {
  if (cachedUser !== undefined) return Promise.resolve(cachedUser);
  if (pendingUser) return pendingUser;
  pendingUser = fetch("/api/me")
    .then((r) => r.json())
    .then((d: { user?: SessionUser | null }) => {
      cachedUser = d.user ?? null;
      return cachedUser;
    })
    .catch(() => null)
    .finally(() => {
      pendingUser = null;
    });
  return pendingUser;
}

/**
 * Klientské načtení přihlášeného uživatele přes `/api/me`. Umožňuje, aby stránka byla
 * **statická** (nemusí číst session při SSR → servíruje se z CDN); user se dohydratuje
 * po mountu (anon = null). Cena: krátký flash „nepřihlášen" v hlavičce. Sdílené mezi
 * statickými záložkami (Zápasy, Tabulky…).
 */
export function useCurrentUser(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(() => cachedUser ?? null);
  useEffect(() => {
    let active = true;
    void loadCurrentUser().then((current) => {
      if (active) setUser(current);
    });
    return () => {
      active = false;
    };
  }, []);
  return user;
}
