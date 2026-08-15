export const PREDICTION_PRESET_THRESHOLD = 0.6;

export type PredictionPresetId = "all" | "home-60" | "away-60" | "over25-60" | "btts-60" | "cards-over35-60";

export interface PredictionPresetSignals {
  homeWin: number;
  awayWin: number;
  over25: number;
  bttsYes: number;
  cardsOver35: number | null;
}

export const PREDICTION_PRESETS: Array<{ id: PredictionPresetId; label: string }> = [
  { id: "all", label: "Všechny zápasy" },
  { id: "home-60", label: "Domácí favorit ≥ 60 %" },
  { id: "away-60", label: "Hostující favorit ≥ 60 %" },
  { id: "over25-60", label: "Over 2,5 gólu ≥ 60 %" },
  { id: "btts-60", label: "Oba skórují ≥ 60 %" },
  { id: "cards-over35-60", label: "Karty Over 3,5 ≥ 60 %" },
];

export function isPredictionPresetId(value: string | null): value is PredictionPresetId {
  return PREDICTION_PRESETS.some((preset) => preset.id === value);
}

export function predictionPresetProbability(value: PredictionPresetSignals, preset: PredictionPresetId): number | null {
  if (preset === "all") return null;
  if (preset === "home-60") return value.homeWin;
  if (preset === "away-60") return value.awayWin;
  if (preset === "over25-60") return value.over25;
  if (preset === "btts-60") return value.bttsYes;
  return value.cardsOver35;
}

export function matchesPredictionPreset(value: PredictionPresetSignals, preset: PredictionPresetId): boolean {
  if (preset === "all") return true;
  const probability = predictionPresetProbability(value, preset);
  return probability != null && probability >= PREDICTION_PRESET_THRESHOLD;
}

export function predictionPresetReason(value: PredictionPresetSignals, preset: PredictionPresetId): string | null {
  const probability = predictionPresetProbability(value, preset);
  if (probability == null) return null;
  const label = preset === "home-60" ? "Domácí" : preset === "away-60" ? "Hosté" : preset === "over25-60" ? "Over 2,5" : preset === "btts-60" ? "Oba skórují" : "4+ karet";
  return `${label} ${Math.round(probability * 100)} %`;
}
