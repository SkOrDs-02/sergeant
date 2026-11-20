/**
 * Last validated: 2026-06-15
 * Status: Active
 * Phase 6.6 — pantry-aware quick-add chips for the add-meal flow.
 *
 * Returns up to 5 chips representing meals the user habitually logs. Each chip
 * carries a full macro snapshot so the parent can call the existing meal
 * persistence path from the source step inside `AddMealSheet`.
 *
 * Source classification:
 *   - `pantry`      → meal name normalizes to a pantry-item name (currently
 *                     stocked). These surface first because the user explicitly
 *                     stocked the item.
 *   - `recent-meal` → meal logged ≥1 time in the last 30 days with usable
 *                     macros. Frequency-derived; ranked by recency.
 *
 * Macros come from the most recent log entry for that name (no foodDb async
 * lookup — keeps the hook purely synchronous and avoids a render-time IDB
 * round-trip on the dashboard).
 *
 * Returns `[]` when no candidates exist; the source step renders nothing.
 *
 * @last-validated 2026-05-21
 */
import { useMemo } from "react";
import { type NullableMacros } from "@sergeant/shared";
import {
  matchFoodName,
  todayISODate,
  type MealMacroSource,
  type MealTypeId,
  type NutritionLog,
  type PantryItem,
} from "@sergeant/nutrition-domain";
import { addDaysISODate } from "../lib/nutritionStorage";

export interface QuickChipMacros {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface QuickChip {
  id: string;
  label: string;
  grams: number;
  macros: QuickChipMacros;
  source: "pantry" | "recent-meal";
  lastUsedAt: string;
  /**
   * Продукт і походження КБЖВ запису, з якого взято чип. Повтор — це копія
   * того запису (як «Як учора», `cloneMealsForCopy`), тож звʼязок із
   * продуктом не губиться. Немає — чип пишеться ручним записом.
   */
  foodId?: string | null;
  macroSource?: MealMacroSource;
}

interface Aggregate {
  norm: string;
  label: string;
  count: number;
  /** Скільки разів записано в кожен тип прийому (Х-3 б). */
  byType: Partial<Record<string, number>>;
  lastUsedAt: string;
  lastMacros: NullableMacros;
  lastGrams: number;
  lastFoodId: string | null;
  lastMacroSource: MealMacroSource;
}

function macrosUsable(m: NullableMacros | undefined): m is NullableMacros {
  if (!m) return false;
  return (
    Number.isFinite(m.kcal as number) &&
    (m.kcal as number) > 0 &&
    Number.isFinite(m.protein_g as number) &&
    Number.isFinite(m.fat_g as number) &&
    Number.isFinite(m.carbs_g as number)
  );
}

function nullableToChipMacros(m: NullableMacros): QuickChipMacros {
  return {
    kcal: Math.round((Number(m.kcal) || 0) * 10) / 10,
    protein_g: Math.round((Number(m.protein_g) || 0) * 10) / 10,
    fat_g: Math.round((Number(m.fat_g) || 0) * 10) / 10,
    carbs_g: Math.round((Number(m.carbs_g) || 0) * 10) / 10,
  };
}

/**
 * Aggregate meals over the recent window keyed by normalized name.
 * Last entry wins for macros/grams; total occurrences inform ranking.
 */
function aggregateRecentMeals(
  log: NutritionLog,
  windowDays: number,
): Map<string, Aggregate> {
  // ADR-0078: чіпи агрегують "останні N днів" ТОГО Ж журналу, що тепер
  // пишеться під днем пристрою — Kyiv-ключ тут пропускав/хибно виключав би
  // сьогоднішні записи для не-київських користувачів.
  const today = todayISODate();
  const cutoff = addDaysISODate(today, -windowDays);
  const out = new Map<string, Aggregate>();

  for (const [date, day] of Object.entries(log || {})) {
    if (!date || date < cutoff || date > today) continue;
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const meal of meals) {
      if (!meal) continue;
      // `norm` — лише ключ агрегації; на чіпі показуємо `label`, тобто
      // назву страви як її записали.
      const name = String(meal.name || "").trim();
      const norm = matchFoodName(name);
      if (!name || !norm) continue;
      if (!macrosUsable(meal.macros)) continue;

      const existing = out.get(norm);
      const grams = Number(meal.amount_g);
      const usableGrams = Number.isFinite(grams) && grams > 0 ? grams : 100;

      const byType = existing?.byType ?? {};
      const type = String(meal.mealType || "");
      if (type) byType[type] = (byType[type] ?? 0) + 1;
      if (!existing || date >= existing.lastUsedAt) {
        out.set(norm, {
          norm,
          label: existing?.label || name,
          count: (existing?.count ?? 0) + 1,
          byType,
          lastUsedAt: date,
          lastMacros: meal.macros,
          lastGrams: usableGrams,
          lastFoodId: meal.foodId ? String(meal.foodId) : null,
          lastMacroSource: meal.macroSource || "manual",
        });
      } else {
        existing.count += 1;
      }
    }
  }

  return out;
}

/**
 * `mealType` — прийом поточного часу доби (`quickMealType`: обраний сегмент
 * hero, інакше годинник пристрою). Із ним чипи всередині своєї групи
 * сортуються за тим, скільки разів страву записано саме в цей прийом за
 * 30 днів (OD-27 Х-3 б), далі свіжіше вище. Без нього порядок як раніше.
 */
export function useNutritionQuickChips(
  log: NutritionLog,
  pantryItems: readonly PantryItem[] = [],
  mealType?: MealTypeId,
): QuickChip[] {
  return useMemo(() => {
    const agg = aggregateRecentMeals(log, 30);
    if (agg.size === 0) return [];

    const pantryNorms = new Set(
      (Array.isArray(pantryItems) ? pantryItems : [])
        .map((it) => matchFoodName(it?.name))
        .filter(Boolean),
    );

    const chips: QuickChip[] = [];
    for (const entry of agg.values()) {
      const isPantry = pantryNorms.has(entry.norm);
      chips.push({
        id: `quickchip:${entry.norm}`,
        label: entry.label.trim(),
        grams: entry.lastGrams,
        macros: nullableToChipMacros(entry.lastMacros),
        source: isPantry ? "pantry" : "recent-meal",
        lastUsedAt: entry.lastUsedAt,
        foodId: entry.lastFoodId,
        macroSource: entry.lastMacroSource,
      });
    }

    // Rank: pantry-matched first (the user explicitly stocked it), then by
    // most-recent usage. Frequency breaks ties at the recency level.
    const aggOf = (c: QuickChip) => agg.get(c.id.replace(/^quickchip:/, ""));
    const inSlot = (c: QuickChip) =>
      mealType ? (aggOf(c)?.byType[mealType] ?? 0) : 0;
    chips.sort((a, b) => {
      if (a.source !== b.source) return a.source === "pantry" ? -1 : 1;
      const slot = inSlot(b) - inSlot(a);
      if (slot !== 0) return slot;
      if (a.lastUsedAt !== b.lastUsedAt)
        return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
      return (aggOf(b)?.count ?? 0) - (aggOf(a)?.count ?? 0);
    });

    return chips.slice(0, 5);
  }, [log, pantryItems, mealType]);
}
