/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { clampNonNegative } from "@sergeant/shared";
import {
  addDaysISODate,
  getDaySummary,
  lastNDayKeysOldestFirst,
  type DaySummary,
  type NutritionLog,
} from "./nutritionStorage";
import { isMealTypeId, mealTypeFromLabel, type MealTypeId } from "./mealTypes";

export function getRowsForRange(
  log: NutritionLog,
  endIso: string,
  dayCount: number,
): DaySummary[] {
  return lastNDayKeysOldestFirst(endIso, dayCount).map((d) =>
    getDaySummary(log, d),
  );
}

export interface RowsSummary {
  days: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  daysWithMeals: number;
  daysWithAnyMacros: number;
  /** Backward-compatible alias for daysWithMeals. */
  nonEmptyDays: number;
}

export function summarizeRows(rows: DaySummary[]): RowsSummary {
  const out: RowsSummary = {
    days: rows.length,
    kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    daysWithMeals: 0,
    daysWithAnyMacros: 0,
    nonEmptyDays: 0,
  };
  for (const r of rows) {
    const hasMeals = Boolean(r?.hasMeals) || (Number(r?.mealCount) || 0) > 0;
    const hasAnyMacros = Boolean(r?.hasAnyMacros);
    if (hasMeals) out.daysWithMeals += 1;
    if (hasAnyMacros) out.daysWithAnyMacros += 1;
    out.kcal += Number(r.kcal) || 0;
    out.protein_g += Number(r.protein_g) || 0;
    out.fat_g += Number(r.fat_g) || 0;
    out.carbs_g += Number(r.carbs_g) || 0;
  }
  out.nonEmptyDays = out.daysWithMeals;
  return out;
}

export interface TopMeal {
  name: string;
  count: number;
  kcal: number;
}

export function topMeals(
  log: NutritionLog | null | undefined,
  endIso: string,
  dayCount: number,
  limit = 8,
): TopMeal[] {
  const start = addDaysISODate(endIso, -(dayCount - 1));
  const map = new Map<string, TopMeal>();
  for (const [date, day] of Object.entries(log || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < start || date > endIso) continue;
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const m of meals) {
      const name = String(m?.name || "").trim();
      if (!name) continue;
      const cur = map.get(name) || { name, count: 0, kcal: 0 };
      cur.count += 1;
      cur.kcal += clampNonNegative(m?.macros?.kcal);
      map.set(name, cur);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.kcal - a.kcal)
    .slice(0, Math.max(1, Number(limit) || 8));
}

export type MealTypeBreakdown = Record<string, { count: number; kcal: number }>;

export function mealTypeBreakdown(
  log: NutritionLog | null | undefined,
  endIso: string,
  dayCount: number,
): MealTypeBreakdown {
  const start = addDaysISODate(endIso, -(dayCount - 1));
  const out: MealTypeBreakdown = {};
  for (const [date, day] of Object.entries(log || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < start || date > endIso) continue;
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const m of meals) {
      const type = String(m?.mealType || "") || mealTypeFromLabel(m?.label);
      if (!out[type]) out[type] = { count: 0, kcal: 0 };
      out[type].count += 1;
      out[type].kcal += clampNonNegative(m?.macros?.kcal);
    }
  }
  return out;
}

/**
 * Калорії за типами прийомів для ОДНОГО дня — на відміну від
 * `mealTypeBreakdown`, який агрегує count+kcal по діапазону днів. Потрібно
 * для hero-стрічки дня дашборду (`MealStrip`, спека
 * `docs/90-work/planning/specs/nutrition-hero-day-strip.md`).
 *
 * Тип прийому береться з `m.mealType`, той самий фолбек `mealTypeFromLabel`
 * (за `m.label`), що й у `mealTypeBreakdown` — легасі-записи без валідного
 * `mealType` розпізнаються за текстом підпису.
 */
export function mealTypeKcalForDay(
  log: NutritionLog | null | undefined,
  dayIso: string,
): Record<MealTypeId, number> {
  const out: Record<MealTypeId, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  };
  const day = log?.[dayIso];
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  for (const m of meals) {
    const type = isMealTypeId(m?.mealType)
      ? m.mealType
      : mealTypeFromLabel(m?.label);
    out[type] += clampNonNegative(m?.macros?.kcal);
  }
  return out;
}
