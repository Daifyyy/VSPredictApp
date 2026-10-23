/** Compatibility shell for old imports; all accounting lives in Strategy Hub. */
export function ModelPortfolio({ isPro }: { isPro: boolean }) {
  return <p><a href="/strategie">Přejít na společný přehled strategií</a>{!isPro && " · Detail je součástí PRO"}</p>;
}
