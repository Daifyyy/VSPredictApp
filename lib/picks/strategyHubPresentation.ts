import type { StrategyHubId } from "./strategyHub";

// Presentation only: these groups do not control collection, access or routing.
const PRIMARY: readonly StrategyHubId[] = ["OVER_25", "ONE_X_TWO"];
const EXPERIMENTS: readonly StrategyHubId[] = ["VALUE", "ELO_INTUITION"];

export function groupStrategyHubCatalog<T extends { id: StrategyHubId }>(catalog: readonly T[]) {
  const ordered = (ids: readonly StrategyHubId[]) => ids.flatMap(id => {
    const item = catalog.find(item => item.id === id);
    return item ? [item] : [];
  });
  return {
    primary: ordered(PRIMARY),
    experiments: ordered(EXPERIMENTS),
    secondary: catalog.filter(item => !PRIMARY.includes(item.id) && !EXPERIMENTS.includes(item.id)),
  };
}

export const ONE_X_TWO_RESEARCH = {
  title: "1X2 · výzkum výsledku zápasu",
  statusLabel: "Výzkum · neověřeno",
  description: "Plný model 1X2 má odhadovat všechny tři možnosti: výhru domácích (1), remízu (X) a výhru hostů (2). Jejich pravděpodobnosti dohromady tvoří 100 %.",
  selectionNote: "Model pravděpodobností není strategie výběru sázek. Ta teprve porovnává odhady s kurzy a rozhoduje, zda něco vybrat. Dnes ukazujeme zachycené pravděpodobnosti současného modelu, nikoli výsledky nového plného modelu. Dosavadní bilance výběrů zůstává v pohledu Výkonnost.",
  caution: "Plný model 1X2 je nyní předmětem výzkumu. Tento přehled neoznamuje jeho nasazení a nepředstavuje ověřená sázková doporučení. Historická bilance výběrů sama nepotvrzuje kvalitu plného modelu.",
} as const;
