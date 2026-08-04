"use client";

/**
 * Přepínač dvou (či více) pohledů nad **týmiž už načtenými daty** – segmentované
 * tlačítko přes celou šířku. Sdílí ho Zápasy (Program / Výsledky) i Predikce
 * (Tipy / Jak si model vede).
 *
 * **Přepnutí nesmí nic dotahovat.** Je to jen filtr nad tím, co komponenta už má;
 * kdyby si každý pohled tahal vlastní data, patří sem místo přepínače routa.
 */
export function ViewTabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: { value: T; label: string }[];
  active: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="mt-6 inline-flex w-full rounded-xl border border-border bg-surface p-1 shadow-sm sm:w-auto sm:min-w-80">
      {tabs.map((t) => {
        const activeTab = t.value === active;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            aria-pressed={activeTab}
            className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab
                ? "bg-accent/35 text-foreground ring-1 ring-accent-strong/20"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
