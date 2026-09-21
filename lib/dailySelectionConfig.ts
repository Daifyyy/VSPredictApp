/** Separate kill switches; deliberately disabled unless explicitly enabled. */
export function dailySelectionConfig() {
  return {
    collect: process.env.DAILY_SELECTION_COLLECT_ENABLED === "true",
    ui: process.env.DAILY_SELECTION_UI_ENABLED === "true",
    telegram: process.env.DAILY_SELECTION_TELEGRAM_ENABLED === "true",
  };
}
