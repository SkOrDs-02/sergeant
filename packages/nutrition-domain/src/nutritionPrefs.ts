/**
 * Pure-фабрика дефолтних prefs + нормалізація (парсинг) довільного JSON-вводу
 * у валідний `NutritionPrefs`. `load*`/`persist*` I/O-шар лишається у web.
 */
import { normalizeMacrosNullable, type NullableMacros } from "@sergeant/shared";

import { isMealTypeId } from "./mealTypes.js";
import {
  DEFAULT_WEEKLY_RATE_KG,
  WEEKLY_RATES_KG,
  type MealTemplate,
  type NutritionPrefs,
} from "./nutritionTypes.js";

// Дзеркалить WEIGHT_KG_RANGE з apps/web/src/core/profile/biometrics.ts.
const GOAL_WEIGHT_KG_MIN = 20;
const GOAL_WEIGHT_KG_MAX = 400;

function optionalPositiveNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeGoalWeight(v: unknown): number | null {
  const n = optionalPositiveNumber(v);
  return n != null && n >= GOAL_WEIGHT_KG_MIN && n <= GOAL_WEIGHT_KG_MAX
    ? n
    : null;
}

export function defaultNutritionPrefs(): NutritionPrefs {
  return {
    goal: "balanced",
    servings: 1,
    timeMinutes: 25,
    exclude: "",
    recipeMealType: "any",
    recipePantryMode: "prefer",
    dailyTargetKcal: null,
    dailyTargetProtein_g: null,
    dailyTargetFat_g: null,
    dailyTargetCarbs_g: null,
    mealTemplates: [],
    reminderEnabled: false,
    reminderHour: 12,
    waterGoalMl: 2000,
    weeklyRateKg: DEFAULT_WEEKLY_RATE_KG,
    goalWeightKg: null,
    adaptiveGoalEnabled: true,
    adaptiveGoalIntent: "maintenance",
    adaptiveGoalLastUpdatedAt: null,
    adaptiveGoalLastReason: null,
  };
}

/**
 * Знімок підстави перерахунку. Усі чотири поля мусять бути СПРАВЖНІМИ
 * числами — половина знімка гірша за його відсутність: картка показала б
 * «витрата ≈NaN» замість того, щоб просто змовчати.
 *
 * AI-DANGER: перевірка йде на `typeof`, а не через `Number(...)`. Коерція
 * тут пробивала саме те правило, заради якого функція й існує:
 * `Number(null)`, `Number("")`, `Number(false)` і `Number([])` — усе це 0,
 * тож знімок із суцільних `null` ставав валідною «нульовою підставою», а
 * булеві давали ще й `weightDeltaKg: 1`, тобто вигаданий тренд «+1,0 кг».
 * Людині показали б упевнене пояснення зміни її цілі, зіткане з нічого.
 *
 * Рядки-числа («2180») теж відкидаємо: цей знімок пише наш власний код
 * через `JSON.stringify`, тож рядок на цьому місці означає не «інший
 * формат», а пошкоджені дані.
 */
function normalizeGoalReason(
  v: unknown,
): NutritionPrefs["adaptiveGoalLastReason"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  const nums = [
    "averageIntakeKcal",
    "weightDeltaKg",
    "tdeeKcal",
    "goalKcal",
  ] as const;
  const parsed: Record<string, number> = {};
  for (const key of nums) {
    const n = raw[key];
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    parsed[key] = n;
  }
  return {
    averageIntakeKcal: parsed["averageIntakeKcal"] as number,
    weightDeltaKg: parsed["weightDeltaKg"] as number,
    tdeeKcal: parsed["tdeeKcal"] as number,
    goalKcal: parsed["goalKcal"] as number,
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
      recipeMealType:
        raw["recipeMealType"] === "any" || isMealTypeId(raw["recipeMealType"])
          ? raw["recipeMealType"]
          : "any",
      recipePantryMode:
        raw["recipePantryMode"] === "only" ||
        raw["recipePantryMode"] === "ignore"
          ? raw["recipePantryMode"]
          : "prefer",
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
      weeklyRateKg:
        WEEKLY_RATES_KG.find((r) => r === Number(raw["weeklyRateKg"])) ??
        DEFAULT_WEEKLY_RATE_KG,
      goalWeightKg: normalizeGoalWeight(raw["goalWeightKg"]),
      adaptiveGoalEnabled:
        raw["adaptiveGoalEnabled"] == null
          ? optionalPositiveNumber(raw["dailyTargetKcal"]) == null
          : Boolean(raw["adaptiveGoalEnabled"]),
      adaptiveGoalIntent:
        raw["adaptiveGoalIntent"] === "cutting" ||
        raw["adaptiveGoalIntent"] === "bulking"
          ? raw["adaptiveGoalIntent"]
          : "maintenance",
      adaptiveGoalLastUpdatedAt:
        typeof raw["adaptiveGoalLastUpdatedAt"] === "string"
          ? raw["adaptiveGoalLastUpdatedAt"]
          : null,
      adaptiveGoalLastReason: normalizeGoalReason(
        raw["adaptiveGoalLastReason"],
      ),
    };
  } catch {
    return defaultNutritionPrefs();
  }
}
