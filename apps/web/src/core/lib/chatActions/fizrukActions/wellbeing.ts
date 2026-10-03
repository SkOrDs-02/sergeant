import { MEASUREMENT_BOUNDS, formatNumberUk } from "@sergeant/shared";
import { recordBodyWeight } from "../../../profile/recordBodyWeight";
import {
  deleteFizrukDailyLogEntry,
  persistFizrukDailyLog,
  readFizrukDailyLog,
} from "./shared";
import type { LogWellbeingAction, ChatActionResult } from "../types";

export function logWellbeing(action: LogWellbeingAction): ChatActionResult {
  const input = action.input || {};
  // Канонічна межа ваги (ADR-0080): без неї запис проходив клієнт, а сервер
  // реджектив увесь рядок на `invalid_weight_kg` — запис застрягав
  // несинхронізованим, і людина про це не дізнавалась.
  const weight = Number(input.weight_kg);
  if (Number.isFinite(weight) && weight > 0) {
    const { min, max } = MEASUREMENT_BOUNDS.weightKg;
    if (weight < min || weight > max) {
      return `Вага має бути від ${formatNumberUk(min)} до ${formatNumberUk(max)} кг. Перевір число і спробуй ще раз.`;
    }
  }
  const entry: Record<string, number | string | null> = {
    id: `dl_${Date.now().toString(36)}_${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    weightKg: null,
    sleepHours: null,
    energyLevel: null,
    moodScore: null,
    note: "",
  };
  const parts: string[] = [];
  if (Number.isFinite(weight) && weight > 0) {
    entry["weightKg"] = weight;
    parts.push(`вага ${formatNumberUk(weight)} кг`);
  }
  const sleep = Number(input.sleep_hours);
  if (Number.isFinite(sleep) && sleep >= 0 && sleep <= 24) {
    entry["sleepHours"] = sleep;
    parts.push(`сон ${formatNumberUk(sleep)} год`);
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
  // Той самий кеш і той самий dual-write, що й у `useDailyLog`: запис
  // видно в UI і він синхронізується між пристроями. `readFizrukDailyLog`
  // МУСИТЬ читати кеш — див. AI-DANGER у `shared.ts`.
  persistFizrukDailyLog([entry, ...readFizrukDailyLog()]);
  // Bidirectional weight sync — a Fizruk weigh-in is the canonical "current
  // weight" for Nutrition/Profile (mirrors `useDailyLog.addEntry`).
  if (typeof entry["weightKg"] === "number") {
    recordBodyWeight({
      weightKg: entry["weightKg"],
      at: entry["at"] as string,
    });
  }
  const entryId = entry["id"] as string;
  return {
    result: `Самопочуття записано${parts.length ? ": " + parts.join(", ") : ""}.`,
    undo: () => {
      deleteFizrukDailyLogEntry({ ...entry, id: entryId });
    },
  };
}
