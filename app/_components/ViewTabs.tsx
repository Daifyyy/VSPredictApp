"use client";

import { Tabs } from "./ui/primitives";

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
  return <Tabs items={tabs} value={active} onChange={onSelect} label="Přepnout pohled" className="mt-6 w-full shadow-sm sm:w-auto sm:min-w-80 [&>button]:flex-1 [&>button]:text-sm" />;
}
