/**
 * Prázdný / chybový stav — čárkovaný rámeček přes celou šířku sekce.
 *
 * Býval nakopírovaný v šesti souborech (Zápasy, Predikce, Digest, Přestupy, Tipovačka,
 * Porovnání) v pěti bajtově shodných kopiích a jedné, která se lišila jen horním okrajem.
 * `className` je tu **jen kvůli tomu okraji** – na odsazení má každá stránka jiný rytmus.
 * Vzhled rámečku se nepřepisuje, jinak by se šest kopií vrátilo zadními vrátky.
 */
export function Empty({
  children,
  className = "mt-4",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${className} ui-panel border-dashed bg-surface/70 p-8 text-center text-sm leading-6 text-muted`}
    >
      {children}
    </div>
  );
}
