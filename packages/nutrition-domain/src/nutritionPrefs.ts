/**
 * Pure-фабрика дефолтних prefs + нормалізація (парсинг) довільного JSON-вводу
 * у валідний `NutritionPrefs`. `load*`/`persist*` I/O-шар лишається у web.
 */
import { normalizeMacrosNullable, type NullableMacros } from "@sergeant/shared";

import { isMealTypeId } from "./mealTypes.js";
import type { MealTemplate, NutritionPrefs } from "./nutritionTypes.js";

function optionalPositiveNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function defaultNutritionPrefs(): NutritionPrefs {
  return {
    goal: "balanced",
    servings: 1,
    timeMinutes: 25,
    exclude: "",
    dailyTargetKcal: null,
    dailyTargetProtein_g: null,
    dailyTargetFat_g: null,
    dailyTargetCarbs_g: null,
    mealTemplates: [],
    reminderEnabled: false,
    reminderHour: 12,
    waterGoalMl: 2000,
  };
}

export function normalizeNutritionPrefs(p: unknown): NutritionPrefs {
  if (!p || typeof p !== "object" || Array.isArray(p))
    return defaultNutritionPrefs();
  try {
    const defaults = defaultNutritionPrefs();
    const raw = p as Record<string, unknown>;
    const waterGoalMl = optionalPositiveNumber(raw["waterGoalMl"]);
    const mealTemplates: MealTemplate[] = Array.isArray(raw["mealTemplates"])
      ? (raw["mealTemplates"] as unknown[])
          .filter(
            (t): t is Record<string, unknown> => !!t && typeof t === "object",
          )
          .map((t) => ({
            id: String(t["id"] || `tpl_${Date.now()}`),
            name: String(t["name"] || "").trim(),
            mealType: isMealTypeId(t["mealType"]) ? t["mealType"] : "snack",
            macros: normalizeMacrosNullable(t["macros"]) as NullableMacros,
          }))
          .filter((t) => t.name)
          .slice(0, 40)
      : [];
    return {
      ...defaults,
      ...(raw as Partial<NutritionPrefs>),
      servings: raw["servings"] != null ? Number(raw["servings"]) || 1 : 1,
      timeMinutes:
        raw["timeMinutes"] != null ? Number(raw["timeMinutes"]) || 25 : 25,
      exclude: raw["exclude"] == null ? "" : String(raw["exclude"]),
      goal: raw["goal"] ? String(raw["goal"]) : "balanced",
      dailyTargetKcal: optionalPositiveNumber(raw["dailyTargetKcal"]),
      dailyTargetProtein_g: optionalPositiveNumber(raw["dailyTargetProtein_g"]),
      dailyTargetFat_g: optionalPositiveNumber(raw["dailyTargetFat_g"]),
      dailyTargetCarbs_g: optionalPositiveNumber(raw["dailyTargetCarbs_g"]),
      mealTemplates,
      reminderEnabled: Boolean(raw["reminderEnabled"]),
      reminderHour:
        raw["reminderHour"] != null &&
        Number.isFinite(Number(raw["reminderHour"]))
          ? Math.min(23, Math.max(0, Math.floor(Number(raw["reminderHour"]))))
          : 12,
      waterGoalMl: waterGoalMl != null ? waterGoalMl : defaults.waterGoalMl,
    };
  } catch {
    return defaultNutritionPrefs();
  }
}
