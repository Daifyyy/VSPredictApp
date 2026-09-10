"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function PageBackLink({ fallback = "/", label = "Zpět" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return <button type="button" onClick={() => window.history.length > 1 ? router.back() : router.push(fallback)} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-background hover:text-foreground"><span aria-hidden>←</span>{label}</button>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav aria-label="Drobečková navigace"><ol className="flex flex-wrap items-center gap-1 text-xs text-muted">{items.map((item, index) => <li key={`${item.label}-${index}`} className="flex items-center gap-1">{index > 0 ? <span aria-hidden className="text-border">/</span> : null}{item.href ? <Link href={item.href} className="rounded px-1 py-0.5 transition hover:bg-background hover:text-foreground">{item.label}</Link> : <span aria-current="page" className="px-1 py-0.5 font-semibold text-foreground">{item.label}</span>}</li>)}</ol></nav>;
}
