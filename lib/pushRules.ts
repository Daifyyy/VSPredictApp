export function isMeaningfulMarketMove(input: {
  samples: number;
  open: number;
  current: number;
  model: number;
  thresholdPoints: number;
}): boolean {
  if (input.samples < 3) return false;
  const move = input.current - input.open;
  return Math.abs(move) >= input.thresholdPoints / 100 &&
    Math.abs(input.model - input.current) < Math.abs(input.model - input.open);
}

export function isSmartNotificationTarget(input: {
  explicitFixtureFavorite: boolean;
  favoriteLeague: boolean;
  includeFavoriteLeagues: boolean;
}): boolean {
  return input.explicitFixtureFavorite ||
    (input.includeFavoriteLeagues && input.favoriteLeague);
}
