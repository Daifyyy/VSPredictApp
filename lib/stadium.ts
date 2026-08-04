/** Přeloží známé hodnoty povrchu z API-Football; neznámý text bezpečně zachová. */
export function localizeStadiumSurface(surface: string | null | undefined): string | null {
  const value = surface?.trim();
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (normalized === "grass" || normalized === "natural grass") return "Přírodní tráva";
  if (["artificial", "artificial turf", "synthetic", "synthetic turf"].includes(normalized)) {
    return "Umělý trávník";
  }
  if (normalized === "hybrid" || normalized === "hybrid grass") return "Hybridní trávník";
  return value.charAt(0).toLocaleUpperCase("cs-CZ") + value.slice(1);
}
