import { mirrorWeightToBiometrics } from "../../../profile/biometrics";
import { persistFizrukDailyLog, readFizrukDailyLog } from "./shared";
import type { LogWellbeingAction, ChatActionResult } from "../types";

export function logWellbeing(action: LogWellbeingAction): ChatActionResult {
  const input = action.input || {};
  const entry: Record<string, number | string | null> = {
    id: `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    weightKg: null,
    sleepHours: null,
    energyLevel: null,
    moodScore: null,
    note: "",
  };
  const parts: string[] = [];
  const weight = Number(input.weight_kg);
  if (Number.isFinite(weight) && weight > 0) {
    entry["weightKg"] = weight;
    parts.push(`вага ${weight} кг`);
  }
  const sleep = Number(input.sleep_hours);
  if (Number.isFinite(sleep) && sleep >= 0 && sleep <= 24) {
    entry["sleepHours"] = sleep;
    parts.push(`сон ${sleep} год`);
  }
  const energy = Number(input.energy_level);
  if (Number.isFinite(energy) && energy >= 1 && energy <= 5) {
    entry["energyLevel"] = Math.round(energy);
    parts.push(`енергія ${Math.round(energy)}/5`);
  }
  const mood = Number(input.mood_score);
  if (Number.isFinite(mood) && mood >= 1 && mood <= 5) {
    entry["moodScore"] = Math.round(mood);
    parts.push(`настрій ${Math.round(mood)}/5`);
  }
  if (input.note && String(input.note).trim()) {
    entry["note"] = String(input.note).trim().slice(0, 500);
  }
  if (parts.length === 0 && !entry["note"])
    return "Немає жодного валідного поля для самопочуття.";
  // `useDailyLog` reads LS but mirrors to SQLite; reproduce both so an
  // AI-logged entry is visible in the UI AND synced cross-device.
  persistFizrukDailyLog([entry, ...readFizrukDailyLog()]);
  // Bidirectional weight sync — a Fizruk weigh-in is the canonical "current
  // weight" for Nutrition/Profile (mirrors `useDailyLog.addEntry`).
  if (typeof entry["weightKg"] === "number") {
    mirrorWeightToBiometrics(entry["weightKg"], entry["at"] as string);
  }
  const entryId = entry["id"] as string;
  return {
    result: `Самопочуття записано${parts.length ? ": " + parts.join(", ") : ""}.`,
    undo: () => {
      const cur = readFizrukDailyLog();
      const next = cur.filter((e) => e.id !== entryId);
      if (next.length !== cur.length) persistFizrukDailyLog(next);
    },
  };
}
