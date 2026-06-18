import { safeReadStringLS } from "@shared/lib/storage/storage";
import { loadRoutineState } from "../../../../modules/routine/lib/routineStorage";
import type { ExportModuleDataAction } from "../types";

export function exportModuleData(action: ExportModuleDataAction): string {
  const { module, format } = (action as ExportModuleDataAction).input;
  const mod = (module || "").toLowerCase().trim();
  const fmt = (format || "text").toLowerCase().trim();
  const exportData = (key: string, label: string) => {
    const raw = safeReadStringLS(key);
    if (!raw) return `${label}: немає даних.`;
    if (fmt === "json")
      return `${label} (JSON):\n${raw.slice(0, 3000)}${raw.length > 3000 ? "\n\u2026(обрізано)" : ""}`;
    try {
      const parsed = JSON.parse(raw);
      return `${label}: ${JSON.stringify(parsed, null, 2).slice(0, 3000)}${raw.length > 3000 ? "\n\u2026(обрізано)" : ""}`;
    } catch {
      return `${label}: ${raw.slice(0, 3000)}`;
    }
  };
  // Same formatting as `exportData` but for an in-memory value rather
  // than a raw LS string — used for SQLite-backed modules whose legacy
  // LS key no longer exists (routine: `hub_routine_v1` is tombstoned).
  const exportValue = (value: unknown, label: string) => {
    const raw = JSON.stringify(value);
    if (!raw || raw === "null" || raw === "{}") return `${label}: немає даних.`;
    if (fmt === "json")
      return `${label} (JSON):\n${raw.slice(0, 3000)}${raw.length > 3000 ? "\n…(обрізано)" : ""}`;
    const pretty = JSON.stringify(value, null, 2);
    return `${label}: ${pretty.slice(0, 3000)}${raw.length > 3000 ? "\n…(обрізано)" : ""}`;
  };
  switch (mod) {
    case "finyk": {
      const parts: string[] = ["Експорт Фінік:"];
      parts.push(exportData("finyk_tx_cache", "Транзакції"));
      return parts.join("\n");
    }
    case "fizruk": {
      const parts: string[] = ["Експорт Фізрук:"];
      parts.push(exportData("fizruk_workouts_v1", "Тренування"));
      parts.push(exportData("fizruk_daily_log_v1", "Щоденний журнал"));
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
      const parts: string[] = ["Експорт Харчування:"];
      parts.push(exportData("nutrition_log_v1", "Журнал їжі"));
      parts.push(exportData("nutrition_prefs_v1", "Налаштування"));
      return parts.join("\n");
    }
    default:
      return `Невідомий модуль: ${mod}. Доступні: finyk, fizruk, routine, nutrition.`;
  }
}
