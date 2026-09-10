import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "accent" | "positive" | "warning" | "negative" | "info";
type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariant: Record<ButtonVariant, string> = {
  primary: "border-foreground bg-foreground text-background shadow-sm hover:-translate-y-px hover:shadow-md",
  accent: "border-accent-strong/30 bg-accent text-accent-ink shadow-sm hover:-translate-y-px hover:bg-accent/85",
  secondary: "border-border bg-surface text-foreground shadow-sm hover:border-foreground/25 hover:bg-background",
  ghost: "border-transparent bg-transparent text-muted hover:bg-background hover:text-foreground",
  danger: "border-negative/20 bg-negative text-white shadow-sm hover:-translate-y-px hover:bg-negative/90",
};

const buttonSize: Record<ButtonSize, string> = {
  sm: "min-h-9 rounded-lg px-3 text-xs",
  md: "min-h-11 rounded-xl px-4 text-sm",
  lg: "min-h-13 rounded-xl px-5 text-sm",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className = "") {
  return `inline-flex items-center justify-center gap-2 border font-bold transition duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 ${buttonVariant[variant]} ${buttonSize[size]} ${className}`;
}

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ActionLink({ href, children, variant = "secondary", size = "md", className = "", prefetch }: { href: string; children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; className?: string; prefetch?: boolean }) {
  return <Link href={href} prefetch={prefetch} className={buttonClass(variant, size, className)}>{children}</Link>;
}

const badgeTone: Record<Tone, string> = {
  neutral: "border-border bg-background text-muted",
  accent: "border-accent-strong/20 bg-accent/20 text-accent-ink",
  positive: "border-positive/20 bg-positive/10 text-positive",
  warning: "border-warning/20 bg-warning/10 text-warning",
  negative: "border-negative/20 bg-negative/10 text-negative",
  info: "border-home/20 bg-home/10 text-home",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badgeTone[tone]} ${className}`}>{children}</span>;
}

export function Panel({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-2xl border border-border bg-surface shadow-[var(--shadow-panel)] ${className}`} {...props}>{children}</section>;
}

export function Alert({ tone = "neutral", title, children, className = "" }: { tone?: Tone; title?: string; children: ReactNode; className?: string }) {
  return <div role={tone === "negative" ? "alert" : "status"} className={`rounded-xl border p-4 text-sm ${badgeTone[tone]} ${className}`}>{title ? <strong className="block text-foreground">{title}</strong> : null}<div className={title ? "mt-1 leading-6" : "leading-6"}>{children}</div></div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-lg bg-border/65 ${className}`} />;
}

export function Tabs<T extends string>({ items, value, onChange, label, className = "" }: { items: Array<{ value: T; label: string; badge?: number }>; value: T; onChange: (value: T) => void; label: string; className?: string }) {
  return <div role="tablist" aria-label={label} className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-background/80 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>{items.map((item) => {
    const active = item.value === value;
    return <button key={item.value} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(item.value)} onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = items.findIndex((candidate) => candidate.value === item.value);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowRight" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
      onChange(items[next].value);
      requestAnimationFrame(() => (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus());
    }} className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${active ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted hover:bg-surface/60 hover:text-foreground"}`}>{item.label}{item.badge != null ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-accent/30" : "bg-border/70"}`}>{item.badge}</span> : null}</button>;
  })}</div>;
}
