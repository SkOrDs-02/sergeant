/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import {
  addDaysISODate,
  getDaySummary,
  type DaySummary,
  type NutritionLog,
} from "./nutritionStorage";
import { mealTypeFromLabel } from "./mealTypes";

function clamp0(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export function getRowsForRange(
  log: NutritionLog,
  endIso: string,
  dayCount: number,
): DaySummary[] {
  const rows: DaySummary[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = addDaysISODate(endIso, -i);
    rows.push(getDaySummary(log, d));
  }
  return rows;
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

export interface AvgMacros {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  denom: number;
}

export function avgFromSummary(sum: RowsSummary): AvgMacros {
  // Prefer averaging only over days where some macros exist to avoid dragging
  // averages down to 0 when meals were logged without macros.
  const denom = Math.max(1, Number(sum?.daysWithAnyMacros) || 0);
  return {
    kcal: sum.kcal / denom,
    protein_g: sum.protein_g / denom,
    fat_g: sum.fat_g / denom,
    carbs_g: sum.carbs_g / denom,
    denom,
  };
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
      cur.kcal += clamp0(m?.macros?.kcal);
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
      out[type].kcal += clamp0(m?.macros?.kcal);
    }
  }
  return out;
}
