"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchableTeam } from "@/lib/teamSearch";
import { TeamLogo } from "./TeamLogo";

export function TeamSearch() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="hidden min-w-0 flex-1 justify-center px-4 sm:flex">
        <SearchBox className="w-full max-w-md" />
      </div>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-muted sm:hidden"
        aria-label="Vyhledat tým"
      >
        <SearchIcon />
      </button>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] bg-foreground/20 p-3 backdrop-blur-sm sm:hidden" role="dialog" aria-modal="true" aria-label="Vyhledávání týmů">
          <div className="rounded-2xl border border-border bg-surface p-3 shadow-xl">
            <div className="flex items-center gap-2">
              <SearchBox className="min-w-0 flex-1" autoFocus onNavigate={() => setMobileOpen(false)} />
              <button type="button" onClick={() => setMobileOpen(false)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-muted">Zavřít</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SearchBox({ className = "", autoFocus = false, onNavigate }: { className?: string; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const reactId = useId();
  const listId = `team-search-${reactId.replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchableTeam[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search/teams?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json() as Promise<{ results?: SearchableTeam[] }>;
        })
        .then((data) => {
          setResults(data.results ?? []);
          setActiveIndex((data.results?.length ?? 0) > 0 ? 0 : -1);
          setError(false);
          setLoading(false);
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setResults([]);
          setActiveIndex(-1);
          setError(true);
          setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function change(value: string) {
    setQuery(value);
    const searchable = value.trim().length >= 2;
    setOpen(searchable);
    setLoading(searchable);
    setError(false);
    if (!searchable) {
      setResults([]);
      setActiveIndex(-1);
    }
  }

  function navigate(team: SearchableTeam) {
    setOpen(false);
    onNavigate?.();
    router.push(`/tym/${team.id}?league=${team.leagueId}`);
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      navigate(results[activeIndex]);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted" />
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(event) => change(event.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={keyDown}
        role="combobox"
        aria-label="Vyhledat tým"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        placeholder="Vyhledat tým…"
        className="ui-control w-full rounded-xl py-2 pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-positive focus:ring-2 focus:ring-positive/15"
      />
      {open ? (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+.45rem)] z-[90] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl">
          {loading ? <SearchMessage>Hledám týmy…</SearchMessage> : error ? <SearchMessage>Vyhledávání teď není dostupné.</SearchMessage> : results.length === 0 ? <SearchMessage>Žádný tým jsme nenašli.</SearchMessage> : results.map((team, index) => (
            <button
              key={`${team.id}-${team.leagueId}`}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => navigate(team)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${activeIndex === index ? "bg-accent/25" : "hover:bg-background"}`}
            >
              <TeamLogo src={team.logoUrl} alt={team.name} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">{team.name}</span>
                <span className="block truncate text-xs text-muted">{team.leagueName}{team.country ? ` · ${team.country}` : ""}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchMessage({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm text-muted" role="status">{children}</p>;
}

function SearchIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-5 w-5 ${className}`}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}
