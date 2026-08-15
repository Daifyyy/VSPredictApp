"use client";

function addDay(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function label(date: string, today: string): string {
  if (date === today) return "Dnes";
  if (date === addDay(today, 1)) return "Zítra";
  if (date === addDay(today, -1)) return "Včera";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("cs-CZ", {
    weekday: "short", day: "numeric", month: "numeric",
  });
}

function pragueToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function CompetitionDayTabs({
  days,
  activeDate,
  onSelect,
  today = pragueToday(),
}: {
  days: { date: string; count: number }[];
  activeDate: string;
  onSelect: (date: string) => void;
  today?: string;
}) {
  return <div className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {days.map((day) => {
      const active = day.date === activeDate;
      return <button
        key={day.date}
        type="button"
        aria-pressed={active}
        onClick={() => onSelect(day.date)}
        className={`ui-chip min-h-11 shrink-0 whitespace-nowrap px-3 text-sm font-medium transition ${active
          ? "border-accent-strong/40 bg-accent font-bold text-accent-ink shadow-sm"
          : "border-border bg-surface text-muted hover:border-accent-strong/25 hover:bg-accent/10 hover:text-foreground"}`}
      >
        {label(day.date, today)} <span className="text-xs opacity-70">({day.count})</span>
      </button>;
    })}
  </div>;
}
