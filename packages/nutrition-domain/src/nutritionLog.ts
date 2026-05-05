/**
 * Pure-операції над журналом прийомів їжі. Без `localStorage`.
 *
 * `apps/web/src/modules/nutrition/lib/nutritionStorage.ts` лишається тонким
 * I/O-адаптером над `createModuleStorage`; `apps/mobile` буде імпортувати
 * ті самі функції напряму з `@sergeant/nutrition-domain`.
 */
import {
  macrosHasAnyValue,
  macrosToTotals,
  normalizeMacrosNullable,
  toLocalISODate,
  type Macros,
  type NullableMacros,
} from "@sergeant/shared";

import {
  isMealTypeId,
  labelForMealType,
  mealTypeFromLabel,
} from "./mealTypes.js";
import type {
  DaySummary,
  MacrosRow,
  Meal,
  MealMacroSource,
  MealSearchResult,
  MealSource,
  NutritionDay,
  NutritionLog,
  NutritionLogLike,
} from "./nutritionTypes.js";

function normalizeMacros(mac: unknown): NullableMacros {
  return normalizeMacrosNullable(mac) as NullableMacros;
}

export function normalizeMeal(m: unknown, idx: number): Meal {
  const raw = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
  let id =
    raw["id"] != null && String(raw["id"]).trim()
      ? String(raw["id"]).trim()
      : "";
  if (!id)
    id = `meal_mig_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`;

  const name = raw["name"] != null ? String(raw["name"]).trim() : "";
  const time = raw["time"] != null ? String(raw["time"]).trim() : "";

  const mealType = isMealTypeId(raw["mealType"])
    ? raw["mealType"]
    : mealTypeFromLabel(raw["label"]);

  const label =
    raw["label"] != null && String(raw["label"]).trim()
      ? String(raw["label"]).trim()
      : labelForMealType(mealType);

  const macros = normalizeMacros(raw["macros"]);
  const source: MealSource =
    raw["source"] && String(raw["source"]) === "photo" ? "photo" : "manual";

  const rawMacroSource =
    raw["macroSource"] != null ? String(raw["macroSource"]).trim() : "";
  const macroSource: MealMacroSource =
    rawMacroSource === "manual" ||
    rawMacroSource === "productDb" ||
    rawMacroSource === "photoAI" ||
    rawMacroSource === "recipeAI"
      ? (rawMacroSource as MealMacroSource)
      : source === "photo"
        ? "photoAI"
        : "manual";

  const amount_g =
    raw["amount_g"] != null &&
    Number.isFinite(Number(raw["amount_g"])) &&
    Number(raw["amount_g"]) > 0
      ? Number(raw["amount_g"])
      : null;
  const foodId =
    raw["foodId"] != null && String(raw["foodId"]).trim()
      ? String(raw["foodId"]).trim()
      : null;

  // Pass the FTUX demo flag through untouched. Seeded meals carry
  // `demo: true` so cross-module detectors (see `firstRealEntry.js`) can
  // tell seeded data apart from real entries. Because `useNutritionLog`
  // immediately persists the normalized log back to localStorage, any
  // property dropped here is lost on the first module visit — which is
  // what used to silently re-classify demo meals as real entries and
  // trip the soft-auth prompt.
  const out: Meal = {
    id,
    name,
    time,
    mealType,
    label,
    macros,
    source,
    macroSource,
    amount_g,
    foodId,
  };
  if (raw["demo"] === true) out.demo = true;
  return out;
}

export function normalizeNutritionLog(raw: unknown): NutritionLog {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: NutritionLog = {};
  for (const [dateKey, day] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const mealsRaw = (day as { meals?: unknown } | null)?.meals;
    if (!Array.isArray(mealsRaw)) {
      out[dateKey] = { meals: [] };
      continue;
    }
    out[dateKey] = {
      meals: mealsRaw.map((m, i) => normalizeMeal(m, i)),
    };
  }
  return out;
}

export function addLogEntry(
  log: NutritionLog,
  date: string,
  meal: unknown,
): NutritionLog {
  const normalized = normalizeMeal(meal, 0);
  const day: NutritionDay = log[date] || { meals: [] };
  return {
    ...log,
    [date]: {
      ...day,
      meals: [...(Array.isArray(day.meals) ? day.meals : []), normalized],
    },
  };
}

export function removeLogEntry(
  log: NutritionLog,
  date: string,
  id: string,
): NutritionLog {
  const day = log[date];
  if (!day) return log;
  const meals = (Array.isArray(day.meals) ? day.meals : []).filter(
    (m) => m.id !== id,
  );
  if (meals.length === 0) {
    const next: NutritionLog = { ...log };
    delete next[date];
    return next;
  }
  return { ...log, [date]: { ...day, meals } };
}

export function updateLogEntry(
  log: NutritionLog,
  date: string,
  meal: unknown,
): NutritionLog {
  const normalized = normalizeMeal(meal, 0);
  const day = log[date];
  if (!day) return log;
  const prevMeals = Array.isArray(day.meals) ? day.meals : [];
  const idx = prevMeals.findIndex((m) => m.id === normalized.id);
  if (idx === -1) return log;
  const nextMeals = [...prevMeals];
  nextMeals[idx] = normalized;
  return { ...log, [date]: { ...day, meals: nextMeals } };
}

export function getDayMacros(log: NutritionLogLike, date: string): Macros {
  const day = log?.[date];
  if (!day || !Array.isArray(day.meals))
    return { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  return (day.meals as Meal[]).reduce<Macros>(
    (acc, m) => {
      const mac = macrosToTotals(m?.macros);
      return {
        kcal: acc.kcal + mac.kcal,
        protein_g: acc.protein_g + mac.protein_g,
        fat_g: acc.fat_g + mac.fat_g,
        carbs_g: acc.carbs_g + mac.carbs_g,
      };
    },
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );
}

export function getDaySummary(log: NutritionLogLike, date: string): DaySummary {
  const day = log?.[date];
  const meals = (Array.isArray(day?.meals) ? day.meals : []) as Meal[];
  const totals = getDayMacros(log, date);
  const hasAnyMacros = meals.some((m) => macrosHasAnyValue(m?.macros));
  return {
    date,
    mealCount: meals.length,
    hasMeals: meals.length > 0,
    hasAnyMacros,
    ...totals,
  };
}

export function addDaysISODate(iso: string, deltaDays: number): string {
  // ISO-формат `YYYY-MM-DD` — split дає рівно 3 елементи; `noUncheckedIndexedAccess`
  // цього не виводить, тому розпаковуємо явно з fallback на 0 (`new Date(0,-1,…)`
  // деградує плавно для битих рядків замість throw-у на `undefined - 1`).
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;
  const dt = new Date(y, m - 1, d + deltaDays);
  return toLocalISODate(dt);
}

export function duplicatePreviousDayMeals(
  log: NutritionLog,
  targetDate: string,
): NutritionLog {
  const prev = addDaysISODate(targetDate, -1);
  const prevDay = log[prev];
  if (!prevDay || !Array.isArray(prevDay.meals) || prevDay.meals.length === 0)
    return log;
  const existing = Array.isArray(log[targetDate]?.meals)
    ? log[targetDate].meals
    : [];
  const startIdx = existing.length;
  const clones = prevDay.meals.map((m, i) =>
    normalizeMeal({ ...m, id: undefined, source: "manual" }, startIdx + i),
  );
  return {
    ...log,
    [targetDate]: { meals: [...existing, ...clones] },
  };
}

export function mergeNutritionLogs(
  base: unknown,
  incoming: unknown,
): NutritionLog {
  const a = normalizeNutritionLog(base);
  const b = normalizeNutritionLog(incoming);
  const out: NutritionLog = { ...a };
  for (const [d, dayB] of Object.entries(b)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const mealsB = Array.isArray(dayB?.meals) ? dayB.meals : [];
    if (mealsB.length === 0) continue;
    const existing = Array.isArray(out[d]?.meals) ? out[d].meals : [];
    const merged = [
      ...existing,
      ...mealsB.map((m, i) => normalizeMeal(m, existing.length + i)),
    ];
    out[d] = { meals: merged };
  }
  return out;
}

export function searchMealsByName(
  log: NutritionLogLike,
  query: string,
): MealSearchResult[] {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return [];
  const results: MealSearchResult[] = [];
  for (const [date, day] of Object.entries(log || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const m of (day?.meals || []) as Meal[]) {
      const n = String(m?.name || "").toLowerCase();
      if (n.includes(q)) results.push({ date, meal: m });
    }
  }
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

export function getMacrosForDateRange(
  log: NutritionLogLike,
  endIso: string,
  dayCount: number,
): MacrosRow[] {
  const rows: MacrosRow[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = addDaysISODate(endIso, -i);
    rows.push({ date: d, ...getDayMacros(log, d) });
  }
  return rows;
}

export function estimateLogBytes(log: NutritionLogLike): number {
  try {
    return new Blob([JSON.stringify(log || {})]).size;
  } catch {
    return 0;
  }
}

/** Залишає лише останні `keepCount` календарних днів (за сортуванням дат). */
export function trimLogOldestDays(
  log: unknown,
  keepCount: number,
): NutritionLog {
  const normalized = normalizeNutritionLog(log);
  const dates = Object.keys(normalized)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  if (dates.length <= keepCount) return normalized;
  const drop = dates.slice(0, dates.length - keepCount);
  const out: NutritionLog = { ...normalized };
  for (const d of drop) delete out[d];
  return out;
}
