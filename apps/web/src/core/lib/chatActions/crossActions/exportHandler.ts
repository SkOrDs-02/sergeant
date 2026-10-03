import { getCachedFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import { loadRoutineState } from "../../../../modules/routine/lib/routineStorage";
import {
  loadNutritionLog,
  loadNutritionPrefs,
} from "../../../../modules/nutrition/lib/nutritionStorage";
import {
  readFizrukDailyLog,
  readFizrukWorkouts,
} from "../fizrukActions/shared";
import type { ExportModuleDataAction } from "../types";

export function exportModuleData(action: ExportModuleDataAction): string {
  const { module, format } = (action as ExportModuleDataAction).input;
  const mod = (module || "").toLowerCase().trim();
  const fmt = (format || "text").toLowerCase().trim();
  // Форматує значення з памʼяті (SQLite-кеш / сховище модуля). LS-читання
  // тут більше немає: останній LS-ключ (`fizruk_daily_log_v1`) tombstoned,
  // і його читання експортувало журнал як «немає даних».
  const exportValue = (value: unknown, label: string) => {
    const raw = JSON.stringify(value);
    if (!raw || raw === "null" || raw === "{}" || raw === "[]")
      return `${label}: немає даних.`;
    if (fmt === "json")
      return `${label} (JSON):\n${raw.slice(0, 3000)}${raw.length > 3000 ? "\n…(обрізано)" : ""}`;
    const pretty = JSON.stringify(value, null, 2);
    return `${label}: ${pretty.slice(0, 3000)}${raw.length > 3000 ? "\n…(обрізано)" : ""}`;
  };
  switch (mod) {
    case "finyk": {
      const parts: string[] = ["Експорт Фінік:"];
      // Bank transactions are now stored in the SQLite mirror; serialize
      // the in-memory cache the same way exportData would serialize a LS value.
      // Свідомо СИРИЙ геттер (не visible-варіант): експорт — повний дамп
      // даних юзера, транзакції вимкнених карток теж мають потрапити сюди.
      parts.push(
        exportValue(getCachedFinykMonoMirrorState().transactions, "Операції"),
      );
      return parts.join("\n");
    }
    case "fizruk": {
      const parts: string[] = ["Експорт Фізрук:"];
      // Обидва LS-ключі (`fizruk_workouts_v1`, `fizruk_daily_log_v1`)
      // tombstoned — читаємо канонічні SQLite-списки, інакше журнал
      // експортується як «немає даних» (LS порожній із DCRUD-007).
      parts.push(exportValue(readFizrukWorkouts(), "Тренування"));
      parts.push(exportValue(readFizrukDailyLog(), "Щоденний журнал"));
      return parts.join("\n");
    }
    case "routine": {
      const parts: string[] = ["Експорт Рутина:"];
      // SQLite-backed (PR #057r-tombstone) — `hub_routine_v1` is deleted
      // on boot; read the canonical state via `loadRoutineState()`.
      parts.push(exportValue(loadRoutineState(), "Звички та виконання"));
      return parts.join("\n");
    }
    case "nutrition": {
      const parts: string[] = ["Експорт Їжа:"];
      // `nutrition_log_v1` / `nutrition_prefs_v1` are tombstoned — read canonical.
      parts.push(exportValue(loadNutritionLog(), "Журнал їжі"));
      parts.push(exportValue(loadNutritionPrefs(), "Налаштування"));
      return parts.join("\n");
    }
    default:
      return `Невідомий модуль: ${mod}. Доступні: finyk, fizruk, routine, nutrition.`;
  }
}
